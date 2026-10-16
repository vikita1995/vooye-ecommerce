import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { isAdminUid } from "@/lib/admin-allowlist";

export type FirebaseAdminIdentity = {
  firebaseUid: string;
  email: string;
};

/**
 * Admin APIs use Firebase Authentication, matching the dedicated admin login.
 * Never trust client-supplied role flags or email addresses.
 */
export async function requireFirebaseAdmin(request: Request): Promise<FirebaseAdminIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new Error("Authentication required");

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(token);
  } catch {
    throw new Error("Authentication invalid or expired");
  }

  if (!isAdminUid(decoded.uid)) throw new Error("Forbidden");
  return {
    firebaseUid: decoded.uid,
    email: typeof decoded.email === "string" ? decoded.email : "",
  };
}
