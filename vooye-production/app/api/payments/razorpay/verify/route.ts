import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { razorpayClient, verifyCheckoutSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderId: z.string().trim().min(1).max(128),
  razorpayOrderId: z.string().trim().min(1).max(128),
  razorpayPaymentId: z.string().trim().min(1).max(128),
  razorpaySignature: z.string().trim().min(1).max(512),
});

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function isUniqueConstraintError(cause: unknown) {
  return cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";
}

function payloadHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function recordReconciliationEvent(orderId: string, paymentId: string, eventType: string, payload: unknown) {
  try {
    await db.paymentEvent.create({
      data: {
        orderId,
        providerEventId: `client_verify:${paymentId}`,
        eventType,
        payloadHash: payloadHash(payload),
      },
    });
  } catch (cause) {
    // This is an idempotency key. A duplicate callback must not create another
    // reconciliation event or overwrite payment state.
    if (!isUniqueConstraintError(cause)) throw cause;
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticate(request);

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return fail("Invalid payment response.", 400);
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Invalid payment response.", 400);
    const value = parsed.data;

    const order = await db.order.findFirst({
      where: { id: value.orderId, userId: user.id },
    });
    if (!order || !order.razorpayOrderId || order.razorpayOrderId !== value.razorpayOrderId) {
      return fail("Order not found.", 404);
    }

    if (!verifyCheckoutSignature(value.razorpayOrderId, value.razorpayPaymentId, value.razorpaySignature)) {
      return fail("Payment signature verification failed.", 400);
    }

    // A valid HMAC alone is not proof that Razorpay captured the expected amount.
    // Reconcile against Razorpay's server-side payment resource before fulfilling.
    let providerPayment: {
      id?: string;
      order_id?: string;
      amount?: number;
      currency?: string;
      status?: string;
    };
    try {
      providerPayment = await razorpayClient().payments.fetch(value.razorpayPaymentId) as unknown as typeof providerPayment;
    } catch (cause) {
      const code = cause instanceof Error ? cause.name : "Unknown";
      console.error("Razorpay payment lookup failed:", code);
      return fail("Unable to verify payment with Razorpay right now. Please retry shortly.", 503);
    }

    const reservation = await db.paymentEvent.findUnique({
      where: { providerEventId: "inventory_reserved:" + order.id },
    });
    if (!reservation) {
      await recordReconciliationEvent(order.id, value.razorpayPaymentId, "client.verify.inventory_reservation_missing", {
        internalOrderId: order.id,
        providerOrderId: value.razorpayOrderId,
        providerPaymentId: value.razorpayPaymentId,
      });
      return fail("This order has no inventory reservation. Support reconciliation is required; do not pay again.", 409);
    }

    if (
      providerPayment.id !== value.razorpayPaymentId ||
      providerPayment.order_id !== order.razorpayOrderId ||
      Number(providerPayment.amount) !== order.totalPaise ||
      providerPayment.currency !== order.currency
    ) {
      await recordReconciliationEvent(order.id, value.razorpayPaymentId, "client.verify.payment_mismatch", {
        internalOrderId: order.id,
        providerOrderId: providerPayment.order_id,
        providerPaymentId: providerPayment.id,
        amount: providerPayment.amount,
        currency: providerPayment.currency,
      });
      console.error("Razorpay payment/order amount mismatch", { orderId: order.id });
      return fail("Payment details do not match the order. Support reconciliation is required.", 409);
    }

    if (providerPayment.status !== "captured") {
      return fail("Razorpay has not confirmed a captured payment yet. Please wait and refresh your order status.", 409);
    }

    if (order.status === "PAID" && order.paymentStatus === "CAPTURED" && order.razorpayPaymentId === value.razorpayPaymentId) {
      return NextResponse.json({ ok: true, orderNumber: order.orderNumber }, { headers: { "Cache-Control": "no-store" } });
    }

    if (
      order.status !== "PENDING_PAYMENT" ||
      order.paymentStatus !== "CREATED" ||
      (order.paymentExpiresAt && order.paymentExpiresAt <= new Date())
    ) {
      await recordReconciliationEvent(order.id, value.razorpayPaymentId, "client.verify.captured_after_order_closed", {
        internalOrderId: order.id,
        providerOrderId: value.razorpayOrderId,
        providerPaymentId: value.razorpayPaymentId,
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
      });
      console.error("Captured payment requires order reconciliation", { orderId: order.id, status: order.status });
      return fail("Payment was captured after this order became unavailable. Please contact support; do not pay again.", 409);
    }

    try {
      const result = await db.$transaction(async (tx) => {
        // Compare-and-set claim prevents a simultaneous webhook and browser
        // callback from both decrementing stock for the same order.
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            userId: user.id,
            razorpayOrderId: value.razorpayOrderId,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: new Date() } }],
          },
          data: {
            status: "PAID",
            paymentStatus: "CAPTURED",
            razorpayPaymentId: value.razorpayPaymentId,
          },
        });

        if (claimed.count !== 1) {
          const current = await tx.order.findUnique({ where: { id: order.id } });
          if (current?.status === "PAID" && current.paymentStatus === "CAPTURED" && current.razorpayPaymentId === value.razorpayPaymentId) {
            return { state: "already_paid" as const };
          }
          await tx.paymentEvent.create({
            data: {
              orderId: order.id,
              providerEventId: `client_verify:${value.razorpayPaymentId}`,
              eventType: "client.verify.captured_needs_reconciliation",
              payloadHash: payloadHash({ orderId: order.id, paymentId: value.razorpayPaymentId, status: current?.status ?? "missing" }),
            },
          });
          return { state: "reconciliation_required" as const };
        }

        // Inventory was reserved atomically when this order was created.
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId: `client_verify:${value.razorpayPaymentId}`,
            eventType: "client.verify.captured",
            payloadHash: payloadHash({ orderId: order.id, paymentId: value.razorpayPaymentId, amount: providerPayment.amount, currency: providerPayment.currency }),
          },
        });
        return { state: "captured" as const };
      });

      if (result.state === "reconciliation_required") {
        return fail("Payment was captured but the order changed concurrently. Support reconciliation is required; do not pay again.", 409);
      }
      return NextResponse.json({ ok: true, orderNumber: order.orderNumber }, { headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
      if (isUniqueConstraintError(cause)) {
        const current = await db.order.findUnique({ where: { id: order.id } });
        if (current?.status === "PAID" && current.paymentStatus === "CAPTURED" && current.razorpayPaymentId === value.razorpayPaymentId) {
          return NextResponse.json({ ok: true, orderNumber: current.orderNumber }, { headers: { "Cache-Control": "no-store" } });
        }
      }


      throw cause;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "Authentication required" || message === "Authentication invalid or expired") {
      return fail("Please sign in to verify this payment.", 401);
    }
    if (message === "Forbidden") return fail("You are not allowed to access this order.", 403);
    console.error("Razorpay verification failed:", message || "Unknown error");
    return fail("Payment could not be confirmed. Please contact support if money was deducted.", 500);
  }
}
