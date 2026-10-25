import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CUSTOMER_FIELDS = "id,firebase_uid,full_name,email,phone_e164,phone_verified_at,status,created_at,updated_at";
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

type CustomerRow = {
  id: string;
  firebase_uid: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
type OrderRow = {
  id: string;
  customer_id: string;
  order_number: string;
  status: string;
  currency: string;
  total_amount: number | string;
  created_at: string;
};
type PaymentRow = { order_id: string; status: string; created_at: string };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function safeStatus(value: string) {
  return value.toUpperCase();
}

async function requestDb(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").trim().slice(0, 100);
    const page = Math.max(1, Math.min(10_000, Number(params.get("page") ?? "1") || 1));
    const pageSize = Math.max(1, Math.min(PAGE_SIZE_MAX, Number(params.get("pageSize") ?? String(PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT));

    const db = supabaseRest("customers");
    const queryParams = new URLSearchParams({
      select: CUSTOMER_FIELDS,
      order: "created_at.desc",
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });

    // Restrict PostgREST filter syntax to avoid user-controlled filter operators.
    const search = query.replace(/[(),.*%_\\]/g, " ").trim();
    if (search) {
      const pattern = `*${search}*`;
      queryParams.set("or", `(full_name.ilike.${pattern},email.ilike.${pattern},phone_e164.ilike.${pattern},firebase_uid.ilike.${pattern})`);
    }

    const response = await requestDb(`${db.url}?${queryParams.toString()}`, {
      headers: { ...db.headers, Prefer: "count=exact", Range: `${(page - 1) * pageSize}-${(page * pageSize) - 1}` },
    });
    if (!response.ok) {
      console.error("Admin customer query failed", { status: response.status });
      return fail("Unable to load customer records.", 502);
    }

    const rows = await response.json() as CustomerRow[];
    const range = response.headers.get("content-range") ?? "";
    const totalMatch = range.match(/\/(\d+|\*)$/);
    if (!totalMatch || totalMatch[1] === "*") {
      console.error("Admin customer query omitted exact count");
      return fail("Customer count is temporarily unavailable.", 502);
    }
    const total = Number(totalMatch[1]);

    const customerIds = rows.map((row) => row.id);
    const orderCounts = new Map<string, number>();
    if (customerIds.length) {
      const ordersDb = supabaseRest("orders");
      const countResults = await Promise.all(rows.map(async (customer) => {
        const countQuery = new URLSearchParams({ select: "id", customer_id: `eq.${customer.id}`, limit: "1" });
        const countResponse = await requestDb(`${ordersDb.url}?${countQuery.toString()}`, {
          headers: { ...ordersDb.headers, Prefer: "count=exact", Range: "0-0" },
        });
        if (!countResponse.ok) throw new Error("CUSTOMER_ORDER_COUNT_FAILED");
        const range = countResponse.headers.get("content-range") ?? "";
        const match = range.match(/\/(\d+|\*)$/);
        if (!match || match[1] === "*") throw new Error("CUSTOMER_ORDER_COUNT_FAILED");
        return [customer.id, Number(match[1])] as const;
      }));
      for (const [customerId, count] of countResults) orderCounts.set(customerId, count);
    }
    let orders: OrderRow[] = [];
    let payments: PaymentRow[] = [];
    if (customerIds.length) {
      const ordersDb = supabaseRest("orders");
      const ordersQuery = new URLSearchParams({
        select: "id,customer_id,order_number,status,currency,total_amount,created_at",
        customer_id: `in.(${customerIds.join(",")})`,
        order: "created_at.desc",
        limit: String(Math.min(customerIds.length * 3, 150)),
      });
      const orderResponse = await requestDb(`${ordersDb.url}?${ordersQuery.toString()}`, { headers: ordersDb.headers });
      if (!orderResponse.ok) {
        console.error("Admin recent orders query failed", { status: orderResponse.status });
        return fail("Unable to load recent customer orders.", 502);
      }
      orders = await orderResponse.json() as OrderRow[];

      const orderIds = orders.map((order) => order.id);
      if (orderIds.length) {
        const paymentDb = supabaseRest("payment_transactions");
        const paymentQuery = new URLSearchParams({
          select: "order_id,status,created_at",
          order_id: `in.(${orderIds.join(",")})`,
          order: "created_at.desc",
          limit: "500",
        });
        const paymentResponse = await requestDb(`${paymentDb.url}?${paymentQuery.toString()}`, { headers: paymentDb.headers });
        if (!paymentResponse.ok) {
          console.error("Admin recent payment query failed", { status: paymentResponse.status });
          return fail("Unable to load recent customer payment status.", 502);
        }
        payments = await paymentResponse.json() as PaymentRow[];
      }
    }

    const paymentByOrder = new Map<string, string>();
    for (const payment of payments) {
      if (!paymentByOrder.has(payment.order_id)) paymentByOrder.set(payment.order_id, safeStatus(payment.status));
    }
    const ordersByCustomer = new Map<string, OrderRow[]>();
    for (const order of orders) {
      const list = ordersByCustomer.get(order.customer_id) ?? [];
      if (list.length < 3) list.push(order);
      ordersByCustomer.set(order.customer_id, list);
    }

    const customers = rows.map((customer) => ({
      id: customer.id,
      name: customer.full_name,
      email: customer.email,
      phone: customer.phone_e164,
      phoneVerified: Boolean(customer.phone_verified_at),
      accountStatus: customer.status,
      registeredAt: customer.created_at,
      updatedAt: customer.updated_at,
      orderCount: orderCounts.get(customer.id) ?? 0,
      recentOrders: (ordersByCustomer.get(customer.id) ?? []).map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        status: safeStatus(order.status),
        paymentStatus: paymentByOrder.get(order.id) ?? "PENDING",
        totalPaise: Math.round(Number(order.total_amount) * 100),
        currency: order.currency || "INR",
        createdAt: order.created_at,
      })),
    }));

    return NextResponse.json({
      customers,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }, { headers: NO_STORE });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (["Authentication required", "Authentication invalid or expired", "AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) {
      return fail("Administrator sign-in is required.", 401);
    }
    if (code === "Forbidden") return fail("Administrator access required.", 403);
    if (code === "SUPABASE_CONFIG_MISSING") return fail("Customer service is not configured.", 500);
    console.error("Admin customers API failed", { errorCode: code || "UNKNOWN" });
    return fail("Unable to load customer records.", 500);
  }
}
