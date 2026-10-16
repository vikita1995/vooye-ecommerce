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

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!idToken || idToken.length > 16_384) {
    return NextResponse.json({ error: "Firebase ID token required." }, { status: 401 });
  }

  try {
    const auth = adminAuth();
    await auth.verifyIdToken(idToken, true);
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
  } catch {
    return NextResponse.json({ error: "Unable to create a secure session." }, { status: 401 });
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
