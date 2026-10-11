
import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firebaseAuth() {
  const app =
    getApps().find((item) => item.name === "vooye-customer-orders") ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId:
          process.env.FIREBASE_ADMIN_PROJECT_ID ??
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      "vooye-customer-orders"
    );

  return getAuth(app);
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) return fail("Please sign in to view your orders.", 401);

    let decoded;
    try {
      decoded = await firebaseAuth().verifyIdToken(token);
    } catch {
      return fail("Your sign-in session has expired. Please sign in again.", 401);
    }

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!baseUrl || !key) {
      return fail("Order history service is not configured.", 500);
    }

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const customerResponse = await fetch(
      `${baseUrl}/rest/v1/customers?firebase_uid=eq.${encodeURIComponent(decoded.uid)}&select=id,status`,
      { headers, cache: "no-store" }
    );

    if (!customerResponse.ok) {
      console.error("Order customer lookup failed:", customerResponse.status);
      return fail("Unable to verify your customer account.", 502);
    }

    const customers = (await customerResponse.json()) as {
      id: string;
      status: string;
    }[];

    const customer = customers[0];

    if (!customer) {
      return NextResponse.json({ orders: [] });
    }

    if (customer.status !== "active") {
      return fail("This customer account is inactive.", 403);
    }

    const orderFields =
      "id,order_number,customer_id,status,currency,subtotal,shipping_amount,discount_amount,tax_amount,total_amount,placed_at,created_at,updated_at,customer_note,shipping_address_snapshot";

    const ordersResponse = await fetch(
      `${baseUrl}/rest/v1/orders?customer_id=eq.${encodeURIComponent(customer.id)}&select=${orderFields}&order=created_at.desc`,
      { headers, cache: "no-store" }
    );

    if (!ordersResponse.ok) {
      console.error("Order list request failed:", ordersResponse.status);
      return fail("Unable to load your orders.", 502);
    }

    const orders = (await ordersResponse.json()) as {
      id: string;
      order_number: string;
      customer_id: string;
      status: string;
      currency: string;
      subtotal: number | string;
      shipping_amount: number | string;
      discount_amount: number | string;
      tax_amount: number | string;
      total_amount: number | string;
      placed_at: string | null;
      created_at: string;
      updated_at: string;
      customer_note: string | null;
      shipping_address_snapshot: unknown;
    }[];

    if (orders.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const orderIds = orders.map((order) => order.id);
    const inFilter = `(${orderIds.join(",")})`;
    const itemFields =
      "id,order_id,product_id,product_name,product_sku,quantity,unit_price,line_total,created_at";

    const itemsResponse = await fetch(
      `${baseUrl}/rest/v1/order_items?order_id=in.${encodeURIComponent(inFilter)}&select=${itemFields}&order=created_at.asc`,
      { headers, cache: "no-store" }
    );

    if (!itemsResponse.ok) {
      console.error("Order items request failed:", itemsResponse.status);
      return fail("Unable to load your order items.", 502);
    }

    const items = (await itemsResponse.json()) as {
      id: string;
      order_id: string;
      product_id: string;
      product_name: string;
      product_sku: string | null;
      quantity: number;
      unit_price: number | string;
      line_total: number | string;
      created_at: string;
    }[];

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const existing = itemsByOrder.get(item.order_id) ?? [];
      existing.push(item);
      itemsByOrder.set(item.order_id, existing);
    }

    return NextResponse.json({
      orders: orders.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      })),
    });
  } catch (cause) {
    console.error("Customer orders API error:", cause);
    return fail("Unable to load your order history.", 500);
  }
}
