import { NextRequest, NextResponse } from "next/server";
import { verifySupabaseAccessToken, type VerifiedSupabaseUser } from "@/lib/supabase/verify-token";

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateLimitEntry>();
const MAX_RATE_LIMIT_KEYS = 10_000;
let lastCleanupAt = 0;

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Verify the Supabase Auth access token against Auth, never trust decoded JWT claims alone. */
export async function requireUser(request: NextRequest): Promise<VerifiedSupabaseUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  try {
    return await verifySupabaseAccessToken(token);
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_CONFIG_MISSING") throw error;
    if (error instanceof Error && error.message === "AUTH_SERVICE_UNAVAILABLE") throw error;
    throw new Error("AUTH_INVALID");
  }
}

/** In-memory limiter; replace with a shared atomic store for multi-instance Cloud Run limits. */
export function rateLimitRequest(request: NextRequest, options: {
  scope: string; limit?: number; windowMs?: number; key?: string;
}): NextResponse | null {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  if (!options.scope.trim() || !Number.isInteger(limit) || limit < 1 ||
      !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("Invalid rate-limit configuration");
  }

  const now = Date.now();
  if (now - lastCleanupAt > 60_000 || rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS) {
    for (const [key, entry] of rateLimitBuckets) if (entry.resetAt <= now) rateLimitBuckets.delete(key);
    if (rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS) {
      const oldest = [...rateLimitBuckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      for (const [key] of oldest.slice(0, rateLimitBuckets.size - MAX_RATE_LIMIT_KEYS)) rateLimitBuckets.delete(key);
    }
    lastCleanupAt = now;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const bucketKey = `${options.scope}:${options.key?.trim() || ip}`;
  const existing = rateLimitBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (existing.count >= limit) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((existing.resetAt - now) / 1000))), "Cache-Control": "no-store" },
    });
  }
  existing.count += 1;
  rateLimitBuckets.set(bucketKey, existing);
  return null;
}

/** Privileged REST access is server-only. Never import or return this key in client bundles. */
export function supabaseRest(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_CONFIG_MISSING");
  return {
    url: `${url}/rest/v1/${path.replace(/^\/+/, "")}`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
  };
}

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "AUTH_REQUIRED") return apiError("Please sign in to continue.", 401);
  if (message === "AUTH_INVALID") return apiError("Your session is invalid or expired. Sign in again.", 401);
  if (message === "AUTH_SERVICE_UNAVAILABLE") return apiError("Authentication service is temporarily unavailable.", 503);
  if (message === "SUPABASE_CONFIG_MISSING") return apiError("Supabase service is not configured.", 500);
  console.error("Seller API error:", message || "Unknown error");
  return apiError("The request could not be completed.", 500);
}
