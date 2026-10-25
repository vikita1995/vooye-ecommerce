import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const [newOrders, paidOnline, pendingPayments, failedPayments, processing, shipped, delivered, cancelled, captured] = await Promise.all([
      db.order.count({ where: { status: "PENDING_PAYMENT" } }),
      db.order.count({ where: { paymentProvider: "RAZORPAY", paymentStatus: "CAPTURED" } }),
      db.order.count({ where: { paymentStatus: { in: ["CREATED", "AUTHORIZED"] } } }),
      db.order.count({ where: { paymentStatus: "FAILED" } }),
      db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] }, paymentStatus: "CAPTURED" } }),
      db.order.count({ where: { status: "SHIPPED", paymentStatus: "CAPTURED" } }),
      db.order.count({ where: { status: "DELIVERED", paymentStatus: "CAPTURED" } }),
      db.order.count({ where: { status: "CANCELLED" } }),
      db.order.aggregate({ where: { paymentProvider: "RAZORPAY", paymentStatus: "CAPTURED" }, _sum: { totalPaise: true } }),
    ]);
    const refunded = await db.order.aggregate({ where: { paymentStatus: "REFUNDED" }, _sum: { totalPaise: true } });
    const totalSalesPaise = Math.max(0, (captured._sum.totalPaise ?? 0) - (refunded._sum.totalPaise ?? 0));
    return NextResponse.json({
      metrics: { newOrders, paidOnline, pendingPayments, failedPayments, processing, shipped, delivered, cancelled, totalSalesPaise, currency: "INR" },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause: unknown) {
    const errorRecord =
      typeof cause === "object" && cause !== null
        ? (cause as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown })
        : null;
    const code = cause instanceof Error ? cause.message : "";
    const status = ["Authentication required", "Authentication invalid or expired", "AUTH_REQUIRED", "AUTH_INVALID"].includes(code)
      ? 401
      : code === "Forbidden"
        ? 403
        : 500;

    if (status === 500) {
      // Log structured, sanitized diagnostics. Do not log request headers, tokens, or database URLs.
      const diagnostic = {
        route: "/api/admin/metrics",
        errorType: cause instanceof Error ? cause.name : typeof cause,
        errorMessage:
          cause instanceof Error
            ? cause.message || "(empty Error.message)"
            : errorRecord && typeof errorRecord.message === "string"
              ? errorRecord.message
              : String(cause),
        errorCode: errorRecord && typeof errorRecord.code === "string" ? errorRecord.code : undefined,
        errorStack: cause instanceof Error ? cause.stack : undefined,
      };
      console.error(`Admin metrics API failed ${JSON.stringify(diagnostic)}`);
    }

    return NextResponse.json({
      error: status === 401
        ? "Administrator sign-in is required."
        : status === 403
          ? "Administrator access required."
          : "Unable to load dashboard metrics.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
