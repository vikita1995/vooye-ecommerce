import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const ORDER_STATUSES = new Set([
  "PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED",
  "CANCELLED", "RETURNED", "REFUNDED",
]);

type OrderRow = {
  id: string; order_number: string; customer_id: string; status: string;
  currency: string; subtotal: number | string; shipping_amount: number | string;
  total_amount: number | string; shipping_address_snapshot: unknown;
  created_at: string;
};
type CustomerRow = { id: string; full_name: string | null; email: string | null; phone_e164: string | null };
type ItemRow = {
  id: string; order_id: string; product_id: string; product_name: string;
  quantity: number; unit_price: number | string; line_total: number | string;
};
type PaymentRow = { order_id: string; status: string; provider: string; created_at: string };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}
async function requestDb(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
}
function paise(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
function orderStatus(order: OrderRow, paymentStatus: string) {
  if (order.status === "confirmed") return paymentStatus === "CAPTURED" ? "PAID" : "PENDING_PAYMENT";
  return order.status.toUpperCase();
}
function paymentStatusFor(status: string | undefined) {
  return (status || "pending").toUpperCase();
}

function handleError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  if (["Authentication required", "Authentication invalid or expired", "AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) {
    return fail("Administrator sign-in is required.", 401);
  }
  if (code === "Forbidden") return fail("Administrator access required.", 403);
  if (code === "SUPABASE_CONFIG_MISSING") return fail("Order service is not configured.", 500);
  console.error("Admin orders API failed", { errorCode: code || "UNKNOWN" });
  return fail("Unable to process the order request.", 500);
}

/** Read order/customer/payment data from the deployed Supabase commerce schema. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const statusFilter = request.nextUrl.searchParams.get("status") ?? "all";
    if (statusFilter !== "all" && !ORDER_STATUSES.has(statusFilter)) return fail("Invalid order status filter.", 400);

    const ordersDb = supabaseRest("orders");
    const query = new URLSearchParams({
      select: "id,order_number,customer_id,status,currency,subtotal,shipping_amount,total_amount,shipping_address_snapshot,created_at",
      order: "created_at.desc",
      limit: "100",
    });
    const databaseStatus: Record<string, string> = {
      PENDING_PAYMENT: "pending", PAID: "confirmed", PROCESSING: "processing",
      SHIPPED: "shipped", DELIVERED: "delivered", CANCELLED: "cancelled",
      RETURNED: "returned", REFUNDED: "refunded",
    };
    if (statusFilter !== "all") query.set("status", `eq.${databaseStatus[statusFilter]}`);

    const response = await requestDb(`${ordersDb.url}?${query.toString()}`, { headers: ordersDb.headers });
    if (!response.ok) {
      console.error("Admin order lookup failed", { status: response.status });
      return fail("Unable to load orders.", 502);
    }
    const orders = await response.json() as OrderRow[];
    if (!orders.length) return NextResponse.json({ orders: [] }, { headers: NO_STORE });

    const ids = orders.map((order) => order.id);
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    const [customersResponse, itemsResponse, paymentsResponse] = await Promise.all([
      requestDb(`${supabaseRest("customers").url}?select=id,full_name,email,phone_e164&id=in.(${customerIds.join(",")})`, { headers: supabaseRest("customers").headers }),
      requestDb(`${supabaseRest("order_items").url}?select=id,order_id,product_id,product_name,quantity,unit_price,line_total&order_id=in.(${ids.join(",")})&order=created_at.asc&limit=1000`, { headers: supabaseRest("order_items").headers }),
      requestDb(`${supabaseRest("payment_transactions").url}?select=order_id,status,provider,created_at&order_id=in.(${ids.join(",")})&order=created_at.desc&limit=1000`, { headers: supabaseRest("payment_transactions").headers }),
    ]);
    if (!customersResponse.ok || !itemsResponse.ok || !paymentsResponse.ok) {
      console.error("Admin order detail lookup failed", {
        customers: customersResponse.status, items: itemsResponse.status, payments: paymentsResponse.status,
      });
      return fail("Unable to load order details.", 502);
    }

    const customers = await customersResponse.json() as CustomerRow[];
    const items = await itemsResponse.json() as ItemRow[];
    const payments = await paymentsResponse.json() as PaymentRow[];
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const paymentByOrder = new Map<string, string>();
    for (const payment of payments) {
      if (!paymentByOrder.has(payment.order_id)) paymentByOrder.set(payment.order_id, paymentStatusFor(payment.status));
    }
    const itemsByOrder = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    const mapped = orders.map((order) => {
      const paymentStatus = paymentByOrder.get(order.id) ?? "PENDING";
      const customer = customerById.get(order.customer_id);
      const shipping = record(order.shipping_address_snapshot);
      return {
        id: order.id,
        orderNumber: order.order_number,
        status: orderStatus(order, paymentStatus),
        paymentStatus,
        currency: order.currency || "INR",
        subtotalPaise: paise(order.subtotal),
        shippingPaise: paise(order.shipping_amount),
        totalPaise: paise(order.total_amount),
        shippingName: stringField(shipping.recipient_name) || customer?.full_name || "Customer",
        shippingPhone: stringField(shipping.phone_e164) || customer?.phone_e164 || "",
        shippingAddress1: stringField(shipping.address_line1),
        shippingAddress2: stringField(shipping.address_line2) || null,
        shippingCity: stringField(shipping.city),
        shippingState: stringField(shipping.state),
        shippingPostalCode: stringField(shipping.postal_code),
        createdAt: order.created_at,
        user: { email: customer?.email || "", displayName: customer?.full_name || null },
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          unitPricePaise: paise(item.unit_price),
          lineTotalPaise: paise(item.line_total),
          seller: null,
        })),
      };
    }).filter((order) => statusFilter !== "PAID" || order.paymentStatus === "CAPTURED");

    return NextResponse.json({ orders: mapped }, { headers: NO_STORE });
  } catch (cause) {
    return handleError(cause);
  }
}

/**
 * Only fulfilment transitions are allowed here. Payment status is written by the
 * verified Razorpay callback/webhook, never by this admin endpoint.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("Invalid request body.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid order update.", 400);

    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["order_id", "status"].includes(key))) return fail("Unsupported order update field.", 400);
    const orderId = typeof input.order_id === "string" ? input.order_id.trim() : "";
    const nextStatus = typeof input.status === "string" ? input.status : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return fail("A valid order ID is required.", 400);
    const transitions: Record<string, { from: string; to: string }> = {
      PROCESSING: { from: "confirmed", to: "processing" },
      SHIPPED: { from: "processing", to: "shipped" },
      DELIVERED: { from: "shipped", to: "delivered" },
    };
    const transition = transitions[nextStatus];
    if (!transition) return fail("This order status cannot be set manually.", 400);

    const paymentDb = supabaseRest("payment_transactions");
    const paymentQuery = new URLSearchParams({
      select: "id",
      order_id: `eq.${orderId}`,
      provider: "eq.razorpay",
      status: "eq.captured",
      limit: "1",
    });
    const paymentResponse = await requestDb(`${paymentDb.url}?${paymentQuery.toString()}`, { headers: paymentDb.headers });
    if (!paymentResponse.ok) return fail("Unable to verify captured payment.", 502);
    if (!(await paymentResponse.json() as unknown[]).length) return fail("Order does not have a captured Razorpay payment.", 409);

    const ordersDb = supabaseRest("orders");
    const updateQuery = new URLSearchParams({ id: `eq.${orderId}`, status: `eq.${transition.from}`, select: "id,order_number,status" });
    const updateResponse = await requestDb(`${ordersDb.url}?${updateQuery.toString()}`, {
      method: "PATCH",
      headers: { ...ordersDb.headers, Prefer: "return=representation" },
      body: JSON.stringify({ status: transition.to, updated_at: new Date().toISOString() }),
    });
    if (!updateResponse.ok) {
      console.error("Admin order transition failed", { status: updateResponse.status });
      return fail("Unable to update order status.", 502);
    }
    const updated = await updateResponse.json() as { id: string; order_number: string; status: string }[];
    if (!updated[0]) return fail("Order status changed or is not eligible for this transition. Refresh and try again.", 409);

    return NextResponse.json({
      order: { id: updated[0].id, orderNumber: updated[0].order_number, status: updated[0].status.toUpperCase() },
    }, { headers: NO_STORE });
  } catch (cause) {
    return handleError(cause);
  }
}
