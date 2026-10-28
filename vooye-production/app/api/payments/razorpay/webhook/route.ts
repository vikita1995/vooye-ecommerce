import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { commerceRpc } from "@/lib/commerce-rest";
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

type PaymentEventResult = {
  state?: string;
  order_id?: string;
  order_number?: string;
  reconciliation_required?: boolean;
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
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
    return response({ received: true, ignored: true });
  }

  if (event.event !== "payment.captured" && event.event !== "payment.failed") {
    return response({ received: true, ignored: true });
  }

  if (event.event === "payment.captured" &&
      (entity.status !== "captured" || !Number.isSafeInteger(entity.amount) || !entity.currency)) {
    return response({ received: true, reconciliationRequired: true });
  }

  const providerEventId = request.headers.get("x-razorpay-event-id")?.trim();
  const eventKey = "webhook:" + (providerEventId && providerEventId.length <= 180
    ? providerEventId
    : hash(raw));

  try {
    const result = await commerceRpc<PaymentEventResult>("process_razorpay_payment_event", {
      p_provider_order_id: entity.order_id,
      p_provider_payment_id: entity.id,
      p_event_type: event.event,
      p_event_key: eventKey,
      p_payload_hash: hash(raw),
      p_amount_paise: Number.isSafeInteger(entity.amount) ? entity.amount : null,
      p_currency: entity.currency ?? null,
    });

    const state = result.state ?? "unknown";
    if (result.reconciliation_required ||
        ["unknown_order", "order_missing", "mismatch", "late_capture"].includes(state)) {
      console.error("Razorpay webhook requires payment reconciliation", {
        providerOrderId: entity.order_id,
        state,
      });
      // A verified event is acknowledged to avoid retry storms; reconciliation
      // is recorded by the database RPC and must be handled operationally.
      return response({ received: true, reconciliationRequired: true });
    }

    if (["captured", "duplicate", "duplicate_captured", "failed_and_cancelled",
         "failure_after_capture_ignored", "already_closed"].includes(state)) {
      return response({ received: true, duplicate: state.startsWith("duplicate"), state });
    }

    console.error("Unexpected Supabase payment event result", {
      providerOrderId: entity.order_id,
      state,
    });
    return response({ error: "Payment event processing failed." }, 500);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "Unknown error";
    console.error("Supabase Razorpay webhook processing failed:", code);
    return response({ error: "Webhook processing failed. Please retry." }, 500);
  }
}
