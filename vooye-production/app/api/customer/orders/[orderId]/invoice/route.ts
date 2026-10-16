import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildInvoicePdf,
  ensureInvoiceForPaidOrder,
  InvoiceConfigurationError,
  InvoiceNotReadyError,
} from "@/lib/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ orderId: string }> };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authenticate(request);
    const { orderId } = await context.params;

    // Enforce ownership before attempting invoice issuance or accessing order items.
    const order = await db.order.findFirst({
      where: { id: orderId, userId: user.id },
      include: { items: true },
    });
    if (!order) return fail("Order not found.", 404);

    if (
      order.paymentStatus !== "CAPTURED" ||
      !["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)
    ) {
      return fail("An invoice is available after the payment is successfully captured.", 409);
    }

    const invoice = await ensureInvoiceForPaidOrder(order.id);
    const pdf = buildInvoicePdf(invoice, {
      orderNumber: order.orderNumber,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      items: order.items,
    });
    const filename = `${invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "";
    if (reason === "Authentication required" || reason === "Authentication invalid or expired") {
      return fail("Please sign in again to download your invoice.", 401);
    }
    if (reason === "Forbidden") return fail("You are not allowed to download this invoice.", 403);
    if (cause instanceof InvoiceConfigurationError) {
      return fail("Invoice download is not configured yet. The store owner must add the legal business name and address first.", 503);
    }
    if (cause instanceof InvoiceNotReadyError) {
      return fail(cause.message, 409);
    }
    console.error("Invoice download failed:", reason || "unknown error");
    return fail("Unable to generate the invoice right now. Please try again later.", 500);
  }
}
