import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";
import { commerceRows, commerceRpc } from "@/lib/commerce-rest";
import { razorpayClient, verifyCheckoutSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderId: z.string().trim().uuid(),
  razorpayOrderId: z.string().trim().min(1).max(128),
  razorpayPaymentId: z.string().trim().min(1).max(128),
  razorpaySignature: z.string().trim().min(1).max(512),
});

type CustomerRow = { id: string };
type OrderRow = {
  id: string;
  customer_id: string;
  order_number: string;
  status: string;
  currency: string;
  total_amount: string | number;
};
type PaymentRow = {
  id: string;
  order_id: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider: string;
  status: string;
  amount: string | number;
  currency: string;
};
type PaymentEventResult = {
  state?: string;
  order_id?: string;
  order_number?: string;
  reconciliation_required?: boolean;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function payloadHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return fail("Invalid payment response.", 400);
    }

    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Invalid payment response.", 400);
    const value = parsed.data;

    const identity = await authenticateSupabaseRequest(request);

    // Resolve ownership from the canonical Supabase customer row; do not create
    // or depend on a legacy Prisma User record for payment verification.
    const customers = await commerceRows<CustomerRow>(
      `customers?select=id&firebase_uid=eq.${encodeURIComponent(identity.uid)}&status=eq.active&limit=1`
    );
    const customer = customers[0];
    if (!customer) return fail("Customer profile not found.", 404);

    const orders = await commerceRows<OrderRow>(
      `orders?select=id,customer_id,order_number,status,currency,total_amount&id=eq.${encodeURIComponent(value.orderId)}&customer_id=eq.${encodeURIComponent(customer.id)}&limit=1`
    );
    const order = orders[0];
    if (!order) return fail("Order not found.", 404);

    const payments = await commerceRows<PaymentRow>(
      `payment_transactions?select=id,order_id,provider_order_id,provider_payment_id,provider,status,amount,currency&order_id=eq.${encodeURIComponent(order.id)}&provider=eq.razorpay&limit=1`
    );
    const payment = payments[0];
    if (!payment || payment.order_id !== order.id || payment.provider_order_id !== value.razorpayOrderId) {
      return fail("Order not found.", 404);
    }

    if (!verifyCheckoutSignature(value.razorpayOrderId, value.razorpayPaymentId, value.razorpaySignature)) {
      return fail("Payment signature verification failed.", 400);
    }

    // The browser callback is not authoritative. Confirm the payment directly
    // with Razorpay before invoking the database state transition.
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
      console.error("Razorpay payment lookup failed:", cause instanceof Error ? cause.name : "Unknown");
      return fail("Unable to verify payment with Razorpay right now. Please retry shortly.", 503);
    }

    const expectedAmountPaise = Math.round(Number(payment.amount) * 100);
    if (
      providerPayment.id !== value.razorpayPaymentId ||
      providerPayment.order_id !== payment.provider_order_id ||
      !Number.isSafeInteger(expectedAmountPaise) ||
      Number(providerPayment.amount) !== expectedAmountPaise ||
      Number(providerPayment.amount) !== Math.round(Number(order.total_amount) * 100) ||
      String(providerPayment.currency ?? "").toUpperCase() !== String(payment.currency).toUpperCase() ||
      String(providerPayment.currency ?? "").toUpperCase() !== String(order.currency).toUpperCase()
    ) {
      console.error("Razorpay payment/order mismatch; reconciliation required", { orderId: order.id });
      return fail("Payment details do not match the order. Support reconciliation is required; do not pay again.", 409);
    }

    if (providerPayment.status !== "captured") {
      return fail("Razorpay has not confirmed a captured payment yet. Please wait and refresh your order status.", 409);
    }

    const result = await commerceRpc<PaymentEventResult>("process_razorpay_payment_event", {
      p_provider_order_id: payment.provider_order_id,
      p_provider_payment_id: value.razorpayPaymentId,
      p_event_type: "payment.captured",
      p_event_key: `client_verify:${value.razorpayPaymentId}`,
      p_payload_hash: payloadHash({
        orderId: order.id,
        providerOrderId: providerPayment.order_id,
        providerPaymentId: providerPayment.id,
        amount: providerPayment.amount,
        currency: providerPayment.currency,
        status: providerPayment.status,
      }),
      p_amount_paise: Number(providerPayment.amount),
      p_currency: String(providerPayment.currency),
    });

    if (result.reconciliation_required || ["mismatch", "late_capture", "unknown_order", "order_missing"].includes(result.state ?? "")) {
      console.error("Supabase payment processor requires reconciliation", {
        orderId: order.id,
        state: result.state ?? "unknown",
      });
      return fail("Payment was received but needs support reconciliation. Please do not pay again.", 409);
    }

    if (!["captured", "duplicate", "duplicate_captured"].includes(result.state ?? "")) {
      console.error("Unexpected Supabase payment processor result", {
        orderId: order.id,
        state: result.state ?? "unknown",
      });
      return fail("Payment could not be confirmed. Please contact support if money was deducted.", 503);
    }

    // Invoice issuance still uses the legacy Prisma order model and is not
    // called here: payment state now lives in Supabase. Invoice migration is a
    // separate task; never report an invoice as available until that is done.
    return NextResponse.json({
      ok: true,
      orderNumber: result.order_number ?? order.order_number,
      invoiceAvailable: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(message)) {
      return fail("Please sign in to verify this payment.", 401);
    }
    if (message === "SUPABASE_CONFIG_MISSING") {
      return fail("Payment verification is temporarily unavailable.", 503);
    }
    console.error("Supabase Razorpay verification failed:", message || "Unknown error");
    return fail("Payment could not be confirmed. Please contact support if money was deducted.", 500);
  }
}
