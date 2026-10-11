import "server-only";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { NextRequest } from "next/server";

function authAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("Firebase Admin project ID is not configured.");
    initializeApp({ credential: applicationDefault(), projectId });
  }
  return getAuth();
}
export async function userFromRequest(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try { return await authAdmin().verifyIdToken(match[1], true); } catch { return null; }
}
export async function adminFromRequest(request: NextRequest) {
  const user = await userFromRequest(request);
  const allowed = (process.env.ADMIN_UIDS || "").split(",").map(s=>s.trim()).filter(Boolean);
  if (!user || !allowed.includes(user.uid)) return null;
  return user;
}
