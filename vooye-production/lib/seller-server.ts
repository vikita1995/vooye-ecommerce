
import { NextRequest, NextResponse } from "next/server";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const ADMIN_APP_NAME = "vooye-seller-api";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Lightweight per-process rate limiter.
 * For reliable limits across Cloud Run instances, replace this Map
 * with Redis/Upstash or another shared atomic rate-limit store.
 */
const rateLimitBuckets = new Map<string, RateLimitEntry>();
const MAX_RATE_LIMIT_KEYS = 10_000;
let lastCleanupAt = 0;

function firebaseAdminAuth() {
  const app =
    getApps().find((item) => item.name === ADMIN_APP_NAME) ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId:
          process.env.FIREBASE_ADMIN_PROJECT_ID ??
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      ADMIN_APP_NAME
    );

  return getAuth(app);
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser(
  request: NextRequest
): Promise<DecodedIdToken> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  try {
    // Verifies token signature, issuer, audience, expiry and revocation.
    return await firebaseAdminAuth().verifyIdToken(token, true);
  } catch {
    // Never log bearer tokens.
    throw new Error("AUTH_INVALID");
  }
}

/**
 * Apply after requireUser() on authenticated write endpoints.
 *
 * Supply a verified user UID as options.key for user-based limits.
 * Without it, the function falls back to the request IP.
 */
export function rateLimitRequest(
  request: NextRequest,
  options: {
    scope: string;
    limit?: number;
    windowMs?: number;
    key?: string;
  }
): NextResponse | null {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 60_000;

  if (
    !options.scope.trim() ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isFinite(windowMs) ||
    windowMs < 1
  ) {
    throw new Error("Invalid rate-limit configuration");
  }

  const now = Date.now();

  if (
    now - lastCleanupAt > 60_000 ||
    rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS
  ) {
    for (const [bucketKey, entry] of rateLimitBuckets) {
      if (entry.resetAt <= now) {
        rateLimitBuckets.delete(bucketKey);
      }
    }

    if (rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS) {
      const oldestFirst = [...rateLimitBuckets.entries()].sort(
        (a, b) => a[1].resetAt - b[1].resetAt
      );

      const excess = rateLimitBuckets.size - MAX_RATE_LIMIT_KEYS;
      for (const [bucketKey] of oldestFirst.slice(0, excess)) {
        rateLimitBuckets.delete(bucketKey);
      }
    }

    lastCleanupAt = now;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const clientKey = options.key?.trim() || ip;
  const bucketKey = `${options.scope}:${clientKey}`;
  const existing = rateLimitBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }

  if (existing.count >= limit) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
          ),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  existing.count += 1;
  rateLimitBuckets.set(bucketKey, existing);
  return null;
}

export function supabaseRest(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_CONFIG_MISSING");
  }

  return {
    url: `${url}/rest/v1/${path.replace(/^\/+/, "")}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
}

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "AUTH_REQUIRED") {
    return apiError("Please sign in to continue.", 401);
  }

  if (message === "AUTH_INVALID") {
    return apiError(
      "Your session is invalid or expired. Sign in again.",
      401
    );
  }

  if (message === "SUPABASE_CONFIG_MISSING") {
    return apiError("Seller service is not configured.", 500);
  }

  console.error("Seller API error:", message || "Unknown error");
  return apiError("The request could not be completed.", 500);
}
