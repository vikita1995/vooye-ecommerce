import { Prisma, type User, type UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateSupabaseRequest, type VerifiedSupabaseUser } from "@/lib/supabase/verify-token";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizedEmail(email: string | undefined, uid: string): string {
  const value = email?.trim().toLowerCase();
  // Prisma currently requires email. Phone-only Supabase accounts receive a stable
  // internal placeholder until an email is linked; it is never shown as a verified address.
  return value || `phone+${uid}@users.vooye.invalid`;
}

/** Validate the Supabase bearer token, then resolve the existing Prisma account. */
export async function authenticate(request: Request): Promise<User> {
  const identity = await authenticateSupabaseRequest(request);
  const email = normalizedEmail(identity.email, identity.uid);
  const existingUser = await db.user.findUnique({ where: { firebaseUid: identity.uid } });

  if (existingUser) {
    // Never change a persisted role based on user metadata or the request body.
    if (identity.email && existingUser.email !== email) {
      try {
        return await db.user.update({
          where: { id: existingUser.id },
          data: { email, displayName: identity.name?.trim() || existingUser.displayName },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new Error("ACCOUNT_EMAIL_CONFLICT: This email is already associated with another account. Contact support.");
        }
        throw error;
      }
    }
    return existingUser;
  }

  try {
    return await db.user.create({
      data: {
        // Legacy schema field name retained for compatibility; the value is now a Supabase Auth UUID.
        firebaseUid: identity.uid,
        email,
        displayName: identity.name?.trim() || null,
        role: "CUSTOMER",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentUser = await db.user.findUnique({ where: { firebaseUid: identity.uid } });
      if (concurrentUser) return concurrentUser;
      throw new Error("ACCOUNT_EMAIL_CONFLICT: This email is already associated with another account. Contact support.");
    }
    throw error;
  }
}

/** Explicitly sync only basic profile fields; roles and identity keys are immutable here. */
export async function syncUserProfile(user: User, identity: VerifiedSupabaseUser): Promise<User> {
  if (user.firebaseUid !== identity.uid) throw new Error("Forbidden");
  if (!identity.email) return user;

  try {
    return await db.user.update({
      where: { id: user.id },
      data: { email: identity.email.trim().toLowerCase(), displayName: identity.name?.trim() || user.displayName },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("ACCOUNT_EMAIL_CONFLICT: This email is already associated with another account. Contact support.");
    }
    throw error;
  }
}

export function requireRole(user: User, roles: UserRole[]): void {
  if (!roles.includes(user.role)) throw new Error("Forbidden");
}

/** ADMIN_UIDS is a server-side allowlist of Supabase Auth user UUIDs. */
export function isAdminUid(uid: string): boolean {
  return (process.env.ADMIN_UIDS ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(uid);
}

async function hasAdminProfile(uid: string): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) return false;

  const response = await fetch(
    `${baseUrl}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(uid)}&select=role&limit=1`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) throw new Error("SUPABASE_CONFIG_MISSING");
  const rows = (await response.json()) as { role: string }[];
  return rows[0]?.role === "admin";
}

/** Require a verified Supabase Auth UUID allowlisted or assigned admin in trusted profile data. */
export async function requireAdmin(request: Request): Promise<User> {
  const user = await authenticate(request);
  if (!isAdminUid(user.firebaseUid) && !(await hasAdminProfile(user.firebaseUid))) {
    throw new Error("Forbidden");
  }
  return user;
}
