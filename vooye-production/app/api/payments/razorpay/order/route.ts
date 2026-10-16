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
    phone: z.string().trim().refine((value) => normalizeE164Phone(value) !== null, "Enter a phone number with country code.").transform((value) => normalizeE164Phone(value) as string),
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

export async function POST(request: Request) {
  if (process.env.CHECKOUT_ENABLED !== "true") {
    return fail("Checkout is temporarily unavailable while payment and inventory safety checks are being finalized.", 503);
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

    // Fail before creating an internal order if the public Razorpay key is absent.
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      return fail("Razorpay checkout is not configured.", 503);
    }

    const ids = [...new Set(parsed.data.items.map((item) => item.productId))];
    const products = await db.product.findMany({
      where: {
        id: { in: ids },
        status: "ACTIVE",
        seller: { status: "APPROVED" },
      },
    });
    if (products.length !== ids.length) {
      return fail("One or more products are unavailable.", 409);
    }

    const byId = new Map(products.map((product) => [product.id, product]));
    let subtotal = 0;
    const lines = parsed.data.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product || product.stock < item.quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }
      const lineTotalPaise = product.pricePaise * item.quantity;
      subtotal += lineTotalPaise;
      return {
        productId: product.id,
        sellerId: product.sellerId,
        productName: product.name,
        unitPricePaise: product.pricePaise,
        quantity: item.quantity,
        lineTotalPaise,
      };
    });

    const shippingPaise = Number(process.env.SHIPPING_FLAT_FEE_PAISE);
    if (!Number.isSafeInteger(shippingPaise) || shippingPaise < 0) {
      return fail("Shipping is not configured. Please try again later.", 503);
    }

    const totalPaise = subtotal + shippingPaise;
    if (!Number.isSafeInteger(totalPaise) || totalPaise < 1) {
      return fail("Invalid order total.", 400);
    }

    const order = await db.order.create({
      data: {
        orderNumber: `VOO-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        userId: user.id,
        subtotalPaise: subtotal,
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

    try {
      const razorpayOrder = await razorpayClient().orders.create({
        amount: totalPaise,
        currency: "INR",
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
        amount: totalPaise,
        currency: "INR",
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch {
      await db.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });
      return fail("Unable to start Razorpay checkout. Please try again.", 503);
    }
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "Authentication required" || code === "Authentication invalid or expired" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
      return fail("Please sign in before checkout.", 401);
    }
    if (code === "Forbidden") return fail("You are not allowed to start this checkout.", 403);
    if (code === "INSUFFICIENT_STOCK") return fail("One or more items no longer have enough stock.", 409);
    console.error("Razorpay order creation failed:", code || "Unknown error");
    return fail("Unable to start checkout. Please try again.", 500);
  }
}
