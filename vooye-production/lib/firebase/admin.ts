import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

function getAdminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
  const app = getApps().length
    ? getApp()
    : initializeApp({ credential: applicationDefault(), projectId });
  return getAuth(app);
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  if (!token || token.length > 16_384) throw new Error("AUTH_INVALID");
  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new Error("AUTH_INVALID");
  }
}

export async function verifyFirebaseSessionCookie(cookie: string): Promise<DecodedIdToken> {
  if (!cookie || cookie.length > 16_384) throw new Error("AUTH_REQUIRED");
  try {
    return await getAdminAuth().verifySessionCookie(cookie, true);
  } catch {
    throw new Error("AUTH_INVALID");
  }
}

export const FIREBASE_SESSION_COOKIE = "__session";
export const FIREBASE_SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
