import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function rupees(paise: number) {
  return paise / 100;
}

export async function GET(request: Request) {
  try {
    // Orders are created through the Prisma checkout/payment path, so read the
    // same source of truth. authenticate() verifies the Firebase bearer token
    // and resolves the user by Firebase UID.
    const user = await authenticate(request);
    const rows = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPricePaise: true,
            lineTotalPaise: true,
          },
        },
      },
    });

    const orders = rows.map((order) => ({
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      currency: order.currency,
      subtotal: rupees(order.subtotalPaise),
      shipping_amount: rupees(order.shippingPaise),
      discount_amount: 0,
      tax_amount: 0,
      total_amount: rupees(order.totalPaise),
      placed_at: order.createdAt.toISOString(),
      created_at: order.createdAt.toISOString(),
      customer_note: null,
      items: order.items.map((item) => ({
        id: item.id,
        product_name: item.productName,
        product_sku: null,
        quantity: item.quantity,
        unit_price: rupees(item.unitPricePaise),
        line_total: rupees(item.lineTotalPaise),
      })),
    }));

    return NextResponse.json({ orders }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "Authentication required" || code === "Authentication invalid or expired" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
      return fail("Please sign in to view your orders.", 401);
    }
    if (code === "Forbidden") return fail("You are not allowed to view these orders.", 403);
    console.error("Customer orders API error:", code || "Unknown error");
    return fail("Unable to load your order history. Please try again.", 500);
  }
}
