import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const user = await authenticate(request);
    const orders = await db.order.findMany({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        order_number: order.orderNumber,
        status: order.status,
        payment_status: order.paymentStatus,
        currency: order.currency,
        subtotal: order.subtotalPaise / 100,
        shipping_amount: order.shippingPaise / 100,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: order.totalPaise / 100,
        placed_at: order.createdAt.toISOString(),
        created_at: order.createdAt.toISOString(),
        customer_note: null,
        invoice_order_id:
          order.paymentStatus === "CAPTURED" &&
          ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)
            ? order.id
            : null,
        items: order.items.map((item) => ({
          id: item.id,
          product_name: item.productName,
          product_sku: null,
          quantity: item.quantity,
          unit_price: item.unitPricePaise / 100,
          line_total: item.lineTotalPaise / 100,
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "";
    if (reason === "Authentication required" || reason === "Authentication invalid or expired") {
      return fail("Please sign in again to view your orders.", 401);
    }
    if (reason === "Forbidden") return fail("You are not allowed to view these orders.", 403);
    console.error("Commerce order history failed:", reason || "unknown error");
    return fail("Unable to load your order history right now.", 500);
  }
}
