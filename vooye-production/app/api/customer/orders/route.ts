import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";
import { commerceRows } from "@/lib/commerce-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerRow = { id: string };
type OrderRow = {
  id: string; order_number: string; status: string; currency: string;
  subtotal: string | number; shipping_amount: string | number; total_amount: string | number;
  customer_note: string | null; placed_at: string | null; created_at: string;
};
type ItemRow = {
  id: string; order_id: string; product_name: string; product_sku: string | null;
  quantity: number; unit_price: string | number; line_total: string | number;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const identity = await authenticateSupabaseRequest(request);
    const customerRows = await commerceRows<CustomerRow>(
      `customers?select=id&firebase_uid=eq.${encodeURIComponent(identity.uid)}&status=eq.active&limit=1`
    );
    const customer = customerRows[0];
    if (!customer) return fail("Customer profile not found.", 404);

    const rows = await commerceRows<OrderRow>(
      `orders?select=id,order_number,status,currency,subtotal,shipping_amount,total_amount,customer_note,placed_at,created_at&customer_id=eq.${customer.id}&order=created_at.desc&limit=100`
    );
    const orders = rows.map((order) => order);
    const itemRows = orders.length ? await commerceRows<ItemRow>(
      `order_items?select=id,order_id,product_name,product_sku,quantity,unit_price,line_total&order_id=in.(${orders.map((o) => o.id).join(",")})&order=id.asc`
    ) : [];
    const itemsByOrder = new Map<string, ItemRow[]>();
    for (const item of itemRows) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status.toUpperCase(),
        currency: order.currency,
        subtotal: Number(order.subtotal),
        shipping_amount: Number(order.shipping_amount),
        discount_amount: 0,
        tax_amount: 0,
        total_amount: Number(order.total_amount),
        placed_at: order.placed_at ?? order.created_at,
        created_at: order.created_at,
        customer_note: order.customer_note,
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          id: item.id, product_name: item.product_name, product_sku: item.product_sku,
          quantity: item.quantity, unit_price: Number(item.unit_price), line_total: Number(item.line_total),
        })),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return fail("Please sign in to view your orders.", 401);
    if (code === "SUPABASE_CONFIG_MISSING") return fail("Order history is not configured.", 503);
    console.error("Customer orders API error:", code || "Unknown error");
    return fail("Unable to load your order history. Please try again.", 500);
  }
}
