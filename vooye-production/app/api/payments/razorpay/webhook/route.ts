import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
};

type RazorpayWebhook = {
  event?: string;
  payload?: { payment?: { entity?: RazorpayPaymentEntity } };
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(cause: unknown) {
  return cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";
}

async function recordEvent(orderId: string, key: string, eventType: string, raw: string) {
  try {
    await db.paymentEvent.create({
      data: {
        orderId,
        providerEventId: key,
        eventType,
        payloadHash: hash(raw),
      },
    });
  } catch (cause) {
    if (!isUniqueConstraintError(cause)) throw cause;
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(raw, signature)) {
    return response({ error: "Invalid webhook signature." }, 400);
  }

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(raw) as RazorpayWebhook;
  } catch {
    return response({ error: "Invalid webhook body." }, 400);
  }

  const entity = event.payload?.payment?.entity;
  if (!event.event || !entity?.id || !entity.order_id) {
    // Ignore verified events we do not process; they should not be retried.
    return response({ received: true, ignored: true });
  }

  const razorpayEventId = request.headers.get("x-razorpay-event-id")?.trim();
  const eventKey = `webhook:${razorpayEventId || hash(raw)}`;

  try {
    const existingEvent = await db.paymentEvent.findUnique({ where: { providerEventId: eventKey } });
    if (existingEvent) return response({ received: true, duplicate: true });

    const order = await db.order.findFirst({
      where: { razorpayOrderId: entity.order_id },
    });
    if (!order) {
      // No internal order references this provider event. Log a correlation ID
      // only; don't log the raw request or secrets.
      console.error("Razorpay webhook references an unknown order", { providerOrderId: entity.order_id, event: event.event });
      return response({ received: true, reconciliationRequired: true });
    }

    if (event.event === "payment.failed") {
      await db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            razorpayOrderId: entity.order_id,
          },
          data: { status: "CANCELLED", paymentStatus: "FAILED" },
        });
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId: eventKey,
            eventType: claimed.count === 1 ? "payment.failed" : "payment.failed_after_order_state_change",
            payloadHash: hash(raw),
          },
        });
      });
      return response({ received: true });
    }

    if (event.event !== "payment.captured") {
      return response({ received: true, ignored: true });
    }

    if (
      entity.status !== "captured" ||
      Number(entity.amount) !== order.totalPaise ||
      entity.currency !== order.currency
    ) {
      await recordEvent(order.id, eventKey, "payment.captured_mismatch", raw);
      console.error("Razorpay captured payment needs amount/currency reconciliation", { orderId: order.id });
      return response({ received: true, reconciliationRequired: true });
    }

    if (order.status === "PAID" && order.paymentStatus === "CAPTURED" && order.razorpayPaymentId === entity.id) {
      await recordEvent(order.id, eventKey, "payment.captured_duplicate_after_confirmation", raw);
      return response({ received: true, duplicate: true });
    }

    if (
      order.status !== "PENDING_PAYMENT" ||
      order.paymentStatus !== "CREATED" ||
      (order.paymentExpiresAt && order.paymentExpiresAt <= new Date())
    ) {
      await recordEvent(order.id, eventKey, "payment.captured_needs_reconciliation", raw);
      console.error("Late or unexpected Razorpay capture requires reconciliation", { orderId: order.id, status: order.status });
      return response({ received: true, reconciliationRequired: true });
    }

    try {
      const state = await db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            razorpayOrderId: entity.order_id,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: new Date() } }],
          },
          data: {
            status: "PAID",
            paymentStatus: "CAPTURED",
            razorpayPaymentId: entity.id,
          },
        });

        if (claimed.count !== 1) {
          const current = await tx.order.findUnique({ where: { id: order.id } });
          const samePaymentAlreadyCaptured = current?.status === "PAID" &&
            current.paymentStatus === "CAPTURED" &&
            current.razorpayPaymentId === entity.id;
          await tx.paymentEvent.create({
            data: {
              orderId: order.id,
              providerEventId: eventKey,
              eventType: samePaymentAlreadyCaptured ? "payment.captured_duplicate_after_confirmation" : "payment.captured_needs_reconciliation",
              payloadHash: hash(raw),
            },
          });
          return samePaymentAlreadyCaptured ? "duplicate" as const : "reconciliation" as const;
        }

        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const item of items) {
          const changed = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity }, status: "ACTIVE" },
            data: { stock: { decrement: item.quantity } },
          });
          if (changed.count !== 1) throw new Error("INVENTORY_CONFLICT");
        }

        await tx.paymentEvent.create({
          data: { orderId: order.id, providerEventId: eventKey, eventType: "payment.captured", payloadHash: hash(raw) },
        });
        return "captured" as const;
      });

      if (state === "reconciliation") {
        console.error("Razorpay capture raced with an order state change", { orderId: order.id });
        return response({ received: true, reconciliationRequired: true });
      }
      return response({ received: true, duplicate: state === "duplicate" });
    } catch (cause) {
      if (isUniqueConstraintError(cause)) {
        return response({ received: true, duplicate: true });
      }
      if (cause instanceof Error && cause.message === "INVENTORY_CONFLICT") {
        await recordEvent(order.id, eventKey, "payment.captured_inventory_conflict", raw);
        console.error("Captured Razorpay payment has inventory conflict", { orderId: order.id });
        return response({ received: true, reconciliationRequired: true });
      }
      throw cause;
    }
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "Unknown error";
    console.error("Razorpay webhook processing failed:", code);
    return response({ error: "Webhook processing failed. Please retry." }, 500);
  }
}
