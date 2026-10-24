import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FIREBASE_SESSION_COOKIE, FIREBASE_SESSION_MAX_AGE_MS } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
  const app = getApps().length ? getApp() : initializeApp({ credential: applicationDefault(), projectId });
  return getAuth(app);
}

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const candidate = error as { code?: unknown; name?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  // Log only SDK error identifiers, never messages, tokens, request headers, or credentials.
  return (code || name || "UNKNOWN").replace(/[^a-zA-Z0-9_./-]/g, "").slice(0, 100) || "UNKNOWN";
}

export async function POST(request: NextRequest) {
  // Behind Cloud Run / the production proxy, request.nextUrl.origin may be the
  // internal service origin. Trust the configured public site origin instead.
  // This keeps the origin check strict without rejecting legitimate requests
  // from https://vooye.in.
  const origin = request.headers.get("origin");
  let expectedOrigin = request.nextUrl.origin;
  if (process.env.SITE_URL) {
    try {
      expectedOrigin = new URL(process.env.SITE_URL).origin;
    } catch {
      console.error("[auth-session] invalid_site_url_configuration");
      return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
    }
  }
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim();
  if (!idToken || idToken.length > 16_384) {
    return NextResponse.json({ error: "Firebase ID token required." }, { status: 401 });
  }

  let auth;
  try {
    auth = adminAuth();
  } catch (error) {
    console.error("[auth-session] admin_init_failed", { code: safeErrorCode(error) });
    return NextResponse.json({ error: "Unable to create a secure session." }, { status: 503 });
  }

  try {
    await auth.verifyIdToken(idToken, true);
  } catch (error) {
    console.error("[auth-session] id_token_verification_failed", { code: safeErrorCode(error) });
    return NextResponse.json({ error: "Unable to verify sign-in. Please try again." }, { status: 401 });
  }

  try {
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: FIREBASE_SESSION_MAX_AGE_MS });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(FIREBASE_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(FIREBASE_SESSION_MAX_AGE_MS / 1000),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[auth-session] session_cookie_creation_failed", { code: safeErrorCode(error) });
    return NextResponse.json({ error: "Unable to create a secure session." }, { status: 503 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FIREBASE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
