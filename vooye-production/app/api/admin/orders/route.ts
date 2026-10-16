import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set<OrderStatus>([
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
]);

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function handleError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "Authentication required" || code === "Authentication invalid or expired" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
    return fail("Administrator sign-in is required.", 401);
  }
  if (code === "Forbidden") return fail("Administrator access required.", 403);
  console.error("Admin orders API failed:", code || "Unknown error");
  return fail("Unable to process the order request.", 500);
}

/** GET /api/admin/orders?status=PAID — list orders from the same Prisma store used by checkout. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const statusParam = request.nextUrl.searchParams.get("status");
    if (statusParam && statusParam !== "all" && !allowedStatuses.has(statusParam as OrderStatus)) {
      return fail("Invalid order status filter.", 400);
    }
    const orders = await db.order.findMany({
      where: statusParam && statusParam !== "all" ? { status: statusParam as OrderStatus } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { email: true, displayName: true } },
        items: { select: { id: true, productName: true, quantity: true, unitPricePaise: true, lineTotalPaise: true } },
      },
    });
    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        order_number: order.orderNumber,
        customer_email: order.user.email,
        customer_name: order.shippingName || order.user.displayName,
        status: order.status,
        payment_status: order.paymentStatus,
        currency: order.currency,
        subtotal: order.subtotalPaise / 100,
        shipping_amount: order.shippingPaise / 100,
        total_amount: order.totalPaise / 100,
        created_at: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price: item.unitPricePaise / 100,
          line_total: item.lineTotalPaise / 100,
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return handleError(cause);
  }
}

/**
 * PATCH /api/admin/orders — only allow fulfilment transitions after payment.
 * This endpoint cannot mark orders paid/captured; that is reserved for the
 * verified Razorpay callback/webhook.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request body.", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid order update.", 400);
    }
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["order_id", "status"].includes(key))) {
      return fail("Unsupported order update field.", 400);
    }
    const orderId = typeof input.order_id === "string" ? input.order_id.trim() : "";
    const nextStatus = input.status;
    if (!orderId || orderId.length > 128) return fail("A valid order ID is required.", 400);
    if (nextStatus !== "PROCESSING" && nextStatus !== "SHIPPED" && nextStatus !== "DELIVERED" && nextStatus !== "CANCELLED" && nextStatus !== "REFUND_PENDING") {
      return fail("This order status cannot be set manually.", 400);
    }

    const current = await db.order.findUnique({ where: { id: orderId } });
    if (!current) return fail("Order not found.", 404);
    const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
      PAID: ["PROCESSING", "CANCELLED", "REFUND_PENDING"],
      PROCESSING: ["SHIPPED", "CANCELLED", "REFUND_PENDING"],
      SHIPPED: ["DELIVERED", "REFUND_PENDING"],
    };
    if (!transitions[current.status]?.includes(nextStatus as OrderStatus)) {
      return fail(`Cannot change order status from ${current.status} to ${String(nextStatus)}.`, 409);
    }
    const updated = await db.order.updateMany({
      where: { id: orderId, status: current.status, paymentStatus: "CAPTURED" },
      data: { status: nextStatus as OrderStatus },
    });
    if (updated.count !== 1) return fail("Order status changed concurrently or payment is not captured.", 409);
    const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, status: true, paymentStatus: true } });
    return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return handleError(cause);
  }
}
