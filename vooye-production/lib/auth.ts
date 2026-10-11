import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/db";
import type { User, UserRole } from "@prisma/client";
function adminAuth() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  return getAuth();
}
export async function authenticate(request: Request): Promise<User> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("Authentication required");
  const decoded = await adminAuth().verifyIdToken(header.slice(7));
  const email = decoded.email?.toLowerCase();
  if (!email) throw new Error("Verified account email required");
  return db.user.upsert({
    where: { firebaseUid: decoded.uid },
    update: { email, displayName: decoded.name ?? undefined },
    create: { firebaseUid: decoded.uid, email, displayName: decoded.name ?? null, role: "CUSTOMER" }
  });
}
export function requireRole(user: User, roles: UserRole[]) {
  if (!roles.includes(user.role)) throw new Error("Forbidden");
}
export function isAdminUid(uid: string) {
  return (process.env.ADMIN_UIDS || "").split(",").map(x => x.trim()).filter(Boolean).includes(uid);
}
