
import { NextRequest, NextResponse } from "next/server";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const ADMIN_APP_NAME = "vooye-seller-api";

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

  if (!token) throw new Error("AUTH_REQUIRED");

  try {
    return await firebaseAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new Error("AUTH_INVALID");
  }
}

export function supabaseRest(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("SUPABASE_CONFIG_MISSING");

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
    return apiError("Your session is invalid or expired. Sign in again.", 401);
  }

  if (message === "SUPABASE_CONFIG_MISSING") {
    return apiError("Seller service is not configured.", 500);
  }

  console.error("Seller API error:", message || "Unknown error");
  return apiError("The request could not be completed.", 500);
}
