import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";
import { commerceRpc } from "@/lib/commerce-rest";
import { razorpayClient } from "@/lib/razorpay";
import { isValidIndianPin, normalizeE164Phone } from "@/lib/validation";
import { isCheckoutReady } from "@/lib/checkout-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().uuid(),
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

type CreatedOrder = {
  order_id: string;
  order_number: string;
  amount_paise: number;
  currency: string;
  expires_at: string;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isCheckoutReady()) {
    return fail("Checkout is temporarily unavailable while payment, shipping, and inventory safety checks are finalized.", 503);
  }

  try {
    const identity = await authenticateSupabaseRequest(request);
    let input: unknown;
    try { input = await request.json(); }
    catch { return fail("Invalid checkout request body.", 400); }

    const parsed = bodySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid checkout details.", 400);
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) return fail("Razorpay checkout is not configured.", 503);

    const allowedPins = (process.env.SERVICEABLE_PIN_CODES ?? "")
      .split(",").map((value) => value.trim()).filter((value) => isValidIndianPin(value));
    if (allowedPins.length === 0) return fail("Shipping serviceability is not configured. Please contact support.", 503);
    if (!allowedPins.includes(parsed.data.shipping.postalCode)) return fail("Vooye cannot currently deliver to this PIN code.", 422);

    const shippingFee = Number(process.env.SHIPPING_FLAT_FEE_PAISE);
    if (!Number.isSafeInteger(shippingFee) || shippingFee < 0) return fail("Shipping is not configured. Please try again later.", 503);

    const merged = new Map<string, number>();
    for (const item of parsed.data.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    if ([...merged.values()].some((quantity) => quantity > 10)) return fail("Maximum quantity per product is 10.", 400);
    const items = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));

    const order = await commerceRpc<CreatedOrder>("create_checkout_order", {
      p_firebase_uid: identity.uid,
      p_items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      p_shipping: {
        name: parsed.data.shipping.name,
        phone: parsed.data.shipping.phone,
        address1: parsed.data.shipping.address1,
        address2: parsed.data.shipping.address2 ?? "",
        city: parsed.data.shipping.city,
        state: parsed.data.shipping.state,
        postalCode: parsed.data.shipping.postalCode,
      },
      p_shipping_fee_paise: shippingFee,
    });

    try {
      const razorpayOrder = await razorpayClient().orders.create({
        amount: order.amount_paise,
        currency: order.currency,
        receipt: order.order_number,
        notes: { internalOrderId: order.order_id },
      });
      const attached = await commerceRpc<boolean>("attach_razorpay_order", {
        p_order_id: order.order_id,
        p_firebase_uid: identity.uid,
        p_provider_order_id: razorpayOrder.id,
      });
      if (!attached) {
        // Leave the payment closed for reconciliation rather than return an unusable provider order.
        console.error("Razorpay order created but could not be attached", { internalOrderId: order.order_id });
        return fail("Unable to confirm checkout setup. Please contact support before retrying.", 503);
      }

      return NextResponse.json({
        orderId: order.order_id,
        orderNumber: order.order_number,
        razorpayOrderId: razorpayOrder.id,
        amount: order.amount_paise,
        currency: order.currency,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
      try {
        await commerceRpc<boolean>("cancel_unpaid_checkout_order", {
          p_order_id: order.order_id,
          p_firebase_uid: identity.uid,
          p_reason: "provider_order_creation_failed",
        });
      } catch (releaseError) {
        console.error("Unable to release failed checkout reservation", {
          internalOrderId: order.order_id,
          reason: releaseError instanceof Error ? releaseError.message : "unknown",
        });
      }
      throw cause;
    }
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return fail("Please sign in before checkout.", 401);
    if (code === "SUPABASE_CONFIG_MISSING") return fail("Checkout service is not configured.", 503);
    if (["INSUFFICIENT_STOCK", "P0001"].includes(code)) return fail("One or more items no longer have enough stock or are unavailable.", 409);
    if (["CUSTOMER_NOT_FOUND", "P0002"].includes(code)) return fail("Your customer profile is not ready for checkout. Please update your profile.", 409);
    if (["INVALID_ITEMS", "INVALID_ITEM", "INVALID_QUANTITY", "DUPLICATE_PRODUCT", "INVALID_ORDER_TOTAL", "INVALID_SHIPPING_FEE"].includes(code)) return fail("Checkout details are invalid. Please review your cart and shipping information.", 400);
    console.error("Supabase Razorpay order creation failed:", code || "Unknown error");
    return fail("Unable to start checkout. Please try again.", 500);
  }
}
