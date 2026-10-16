import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

export type VerifiedSupabaseUser = {
  uid: string;
  email?: string;
  name?: string;
  phone_number?: string;
  email_verified: boolean;
  phone_verified: boolean;
};

/**
 * Compatibility export: existing API handlers keep their call sites while
 * bearer tokens are now verified by Firebase Admin rather than Supabase Auth.
 * The UID is the Firebase UID used by the customers.firebase_uid column.
 */
export async function verifySupabaseAccessToken(token: string): Promise<VerifiedSupabaseUser> {
  const user = await verifyFirebaseIdToken(token);
  return {
    uid: user.uid,
    email: user.email,
    name: user.name,
    phone_number: user.phone_number,
    email_verified: Boolean(user.email_verified),
    phone_verified: Boolean(user.phone_number),
  };
}

export async function authenticateSupabaseRequest(request: Request): Promise<VerifiedSupabaseUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  return verifySupabaseAccessToken(token);
}
