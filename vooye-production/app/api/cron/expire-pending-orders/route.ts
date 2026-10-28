import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { commerceRpc } from "@/lib/commerce-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

type ExpiryResult = { expired?: number; skipped?: number };

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) return fail("Order expiry job is not configured.", 503);
  if (!authorized(request)) return fail("Unauthorized.", 401);

  try {
    const result = await commerceRpc<ExpiryResult>("expire_pending_checkout_orders", { p_limit: 100 });
    return NextResponse.json({
      inspected: Number(result.expired ?? 0) + Number(result.skipped ?? 0),
      expired: Number(result.expired ?? 0),
      skipped: Number(result.skipped ?? 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "Unknown error";
    console.error("Supabase pending order expiry failed:", code);
    return fail("Unable to expire pending orders.", 500);
  }
}
