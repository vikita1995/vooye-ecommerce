import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { razorpayClient } from "@/lib/razorpay";
import { isValidIndianPin, normalizeE164Phone } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(30),
  shipping: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim()
      .refine((value) => normalizeE164Phone(value) !== null, "Enter a phone number with country code.")
      .transform((value) => normalizeE164Phone(value) as string),
    address1: z.string().trim().min(4).max(200),
    address2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().refine(isValidIndianPin, "Enter a valid 6-digit Indian PIN code."),
  }),
});

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function releaseReservation(orderId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT", paymentStatus: "CREATED" },
      data: { status: "CANCELLED", paymentStatus: "FAILED" },
    });
    if (cancelled.count !== 1) return;

    const releasedKey = "inventory_released:" + orderId;
    const alreadyReleased = await tx.paymentEvent.findUnique({ where: { providerEventId: releasedKey } });
    if (alreadyReleased) return;

    const reservation = await tx.paymentEvent.findUnique({ where: { providerEventId: "inventory_reserved:" + orderId } });
    if (reservation) {
      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    await tx.paymentEvent.create({
      data: {
        orderId,
        providerEventId: releasedKey,
        eventType: reservation ? "inventory.released." + reason : "inventory.release_skipped_unreserved." + reason,
        payloadHash: sha256({ orderId, reason, hadReservation: Boolean(reservation) }),
      },
    });
  });
}

export async function POST(request: Request) {
  if (process.env.CHECKOUT_ENABLED !== "true") {
    return fail("Checkout is temporarily unavailable while payment, shipping, and inventory safety checks are finalized.", 503);
  }

  try {
    const user = await authenticate(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid checkout request body.", 400);
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid checkout details.", 400);
    }

    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      return fail("Razorpay checkout is not configured.", 503);
    }

    const serviceablePinCodes = (process.env.SERVICEABLE_PIN_CODES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isValidIndianPin(value));
    if (serviceablePinCodes.length === 0) {
      return fail("Shipping serviceability is not configured. Please contact support.", 503);
    }
    if (!serviceablePinCodes.includes(parsed.data.shipping.postalCode)) {
      return fail("Vooye cannot currently deliver to this PIN code.", 422);
    }

    const shippingPaise = Number(process.env.SHIPPING_FLAT_FEE_PAISE);
    if (!Number.isSafeInteger(shippingPaise) || shippingPaise < 0) {
      return fail("Shipping is not configured. Please try again later.", 503);
    }

    // Reserve stock atomically before creating a provider order. This protects
    // against concurrent buyers. The reservation event also makes release
    // operations idempotent without a new schema column.
    const order = await db.$transaction(async (tx) => {
      const lines: {
        productId: string;
        sellerId: string;
        productName: string;
        unitPricePaise: number;
        quantity: number;
        lineTotalPaise: number;
      }[] = [];
      let subtotalPaise = 0;

      for (const requested of parsed.data.items) {
        const product = await tx.product.findFirst({
          where: {
            id: requested.productId,
            status: "ACTIVE",
            stock: { gte: requested.quantity },
            seller: { status: "APPROVED" },
          },
          select: {
            id: true,
            sellerId: true,
            name: true,
            pricePaise: true,
          },
        });
        if (!product) throw new Error("INSUFFICIENT_STOCK");

        const changed = await tx.product.updateMany({
          where: {
            id: product.id,
            status: "ACTIVE",
            stock: { gte: requested.quantity },
            pricePaise: product.pricePaise,
            seller: { status: "APPROVED" },
          },
          data: { stock: { decrement: requested.quantity } },
        });
        if (changed.count !== 1) throw new Error("INSUFFICIENT_STOCK");

        const lineTotalPaise = product.pricePaise * requested.quantity;
        if (!Number.isSafeInteger(lineTotalPaise)) throw new Error("INVALID_ORDER_TOTAL");
        subtotalPaise += lineTotalPaise;
        lines.push({
          productId: product.id,
          sellerId: product.sellerId,
          productName: product.name,
          unitPricePaise: product.pricePaise,
          quantity: requested.quantity,
          lineTotalPaise,
        });
      }

      const totalPaise = subtotalPaise + shippingPaise;
      if (!Number.isSafeInteger(totalPaise) || totalPaise < 1) throw new Error("INVALID_ORDER_TOTAL");

      const created = await tx.order.create({
        data: {
          orderNumber: "VOO-" + Date.now() + "-" + crypto.randomUUID().slice(0, 6).toUpperCase(),
          userId: user.id,
          subtotalPaise,
          shippingPaise,
          totalPaise,
          status: "PENDING_PAYMENT",
          paymentStatus: "CREATED",
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          shippingName: parsed.data.shipping.name,
          shippingPhone: parsed.data.shipping.phone,
          shippingAddress1: parsed.data.shipping.address1,
          shippingAddress2: parsed.data.shipping.address2 || null,
          shippingCity: parsed.data.shipping.city,
          shippingState: parsed.data.shipping.state,
          shippingPostalCode: parsed.data.shipping.postalCode,
          items: { create: lines },
        },
      });

      await tx.paymentEvent.create({
        data: {
          orderId: created.id,
          providerEventId: "inventory_reserved:" + created.id,
          eventType: "inventory.reserved",
          payloadHash: sha256(lines),
        },
      });
      return created;
    });

    try {
      const razorpayOrder = await razorpayClient().orders.create({
        amount: order.totalPaise,
        currency: order.currency,
        receipt: order.orderNumber,
        notes: { internalOrderId: order.id },
      });
      await db.order.update({
        where: { id: order.id },
        data: { razorpayOrderId: razorpayOrder.id },
      });

      return NextResponse.json({
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        amount: order.totalPaise,
        currency: order.currency,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch {
      await releaseReservation(order.id, "provider_order_creation_failed");
      return fail("Unable to start Razorpay checkout. Please try again.", 503);
    }
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "Authentication required" || code === "Authentication invalid or expired" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
      return fail("Please sign in before checkout.", 401);
    }
    if (code === "Forbidden") return fail("You are not allowed to start this checkout.", 403);
    if (code === "INSUFFICIENT_STOCK") return fail("One or more items no longer have enough stock.", 409);
    if (code === "INVALID_ORDER_TOTAL") return fail("The order total is invalid.", 400);
    console.error("Razorpay order creation failed:", code || "Unknown error");
    return fail("Unable to start checkout. Please try again.", 500);
  }
}
