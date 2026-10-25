import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 1000;
const MAX_SALES_PAGES = 100;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Read the live commerce schema through Supabase REST.
 * The deployed database uses public.orders and public.payment_transactions
 * (snake_case), not Prisma's missing "Order" / "User" tables.
 */
async function countRows(table: "orders" | "payment_transactions", filters: Record<string, string>): Promise<number> {
  const resource = supabaseRest(table);
  const query = new URLSearchParams({ select: "id", ...filters, limit: "1" });
  const response = await fetch(`${resource.url}?${query.toString()}`, {
    method: "GET",
    headers: {
      ...resource.headers,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("Admin metrics count query failed", { table, status: response.status });
    throw new Error("METRICS_DATA_UNAVAILABLE");
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const match = contentRange.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") {
    console.error("Admin metrics count response omitted an exact count", { table });
    throw new Error("METRICS_DATA_UNAVAILABLE");
  }
  return Number(match[1]);
}

/** Supabase stores monetary amounts in major currency units; the dashboard API returns paise. */
async function sumCapturedSalesPaise(): Promise<number> {
  const resource = supabaseRest("payment_transactions");
  let totalMajorUnits = 0;

  for (let page = 0; page < MAX_SALES_PAGES; page += 1) {
    const start = page * PAGE_SIZE;
    const query = new URLSearchParams({
      select: "amount",
      provider: "eq.razorpay",
      status: "eq.captured",
      order: "created_at.asc",
      limit: String(PAGE_SIZE),
    });
    const response = await fetch(`${resource.url}?${query.toString()}`, {
      headers: { ...resource.headers, Range: `${start}-${start + PAGE_SIZE - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("Admin metrics sales query failed", { status: response.status, page });
      throw new Error("METRICS_DATA_UNAVAILABLE");
    }

    const rows = await response.json() as Array<{ amount: string | number }>;
    for (const row of rows) {
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        console.error("Admin metrics encountered an invalid captured amount");
        throw new Error("METRICS_DATA_UNAVAILABLE");
      }
      totalMajorUnits += amount;
    }

    if (rows.length < PAGE_SIZE) {
      const paise = Math.round(totalMajorUnits * 100);
      if (!Number.isSafeInteger(paise)) throw new Error("METRICS_DATA_UNAVAILABLE");
      return paise;
    }
  }

  // Do not silently report a partial sales total if the result exceeds our safety cap.
  throw new Error("METRICS_RESULT_TOO_LARGE");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const [
      newOrders,
      paidOnline,
      pendingPayments,
      failedPayments,
      processing,
      shipped,
      delivered,
      cancelled,
      totalSalesPaise,
    ] = await Promise.all([
      countRows("orders", { status: "eq.pending" }),
      countRows("payment_transactions", { provider: "eq.razorpay", status: "eq.captured" }),
      countRows("payment_transactions", { status: "in.(pending,authorized)" }),
      countRows("payment_transactions", { status: "eq.failed" }),
      countRows("orders", { status: "in.(confirmed,processing)" }),
      countRows("orders", { status: "eq.shipped" }),
      countRows("orders", { status: "eq.delivered" }),
      countRows("orders", { status: "eq.cancelled" }),
      sumCapturedSalesPaise(),
    ]);

    return NextResponse.json({
      metrics: {
        newOrders,
        paidOnline,
        pendingPayments,
        failedPayments,
        processing,
        shipped,
        delivered,
        cancelled,
        totalSalesPaise,
        currency: "INR",
      },
    }, { headers: NO_STORE });
  } catch (cause: unknown) {
    const code = cause instanceof Error ? cause.message : "";
    const status = ["Authentication required", "Authentication invalid or expired", "AUTH_REQUIRED", "AUTH_INVALID"].includes(code)
      ? 401
      : code === "Forbidden"
        ? 403
        : code === "SUPABASE_CONFIG_MISSING"
          ? 500
          : 503;

    if (status >= 500) {
      console.error("Admin metrics API failed", {
        route: "/api/admin/metrics",
        errorType: cause instanceof Error ? cause.name : typeof cause,
        errorCode: code || "UNKNOWN",
      });
    }

    return fail(
      status === 401
        ? "Administrator sign-in is required."
        : status === 403
          ? "Administrator access required."
          : status === 503
            ? "Dashboard data is temporarily unavailable. Please retry."
            : "Dashboard service is not configured.",
      status,
    );
  }
}
