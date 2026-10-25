import { Prisma, type User, type UserRole } from "@/generated/prisma/client";
import { isAdminUid } from "@/lib/admin-allowlist";
import { db } from "@/lib/db";
import { authenticateSupabaseRequest, type VerifiedSupabaseUser } from "@/lib/supabase/verify-token";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizedEmail(email: string | undefined, uid: string): string {
  const value = email?.trim().toLowerCase();
  // Prisma currently requires email. Phone-only Firebase accounts receive a stable
  // internal placeholder until an email is linked; it is never shown as a verified address.
  return value || `phone+${uid}@users.vooye.invalid`;
}

/** Validate the Firebase bearer token, then resolve the existing Prisma account. */
export async function authenticate(request: Request): Promise<User> {
  let identity: VerifiedSupabaseUser;
  try {
    identity = await authenticateSupabaseRequest(request);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "AUTH_REQUIRED") throw new Error("Authentication required");
    if (code === "AUTH_INVALID") throw new Error("Authentication invalid or expired");
    throw cause;
  }
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
        // Legacy Prisma field name retained for compatibility; the value is a Firebase UID.
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

/**
 * Admin access is granted by the explicit Firebase UID allowlist first.
 * This avoids requiring a Prisma User row for allowlisted administrators, which
 * is important while customer profiles are stored in Supabase and the legacy
 * Prisma User table may not exist in a deployed database.
 *
 * Non-allowlisted admins may still be authorized through a persisted Prisma role.
 */
export type AdminPrincipal = Pick<User, "firebaseUid" | "email" | "role">;

export async function requireAdmin(request: Request): Promise<AdminPrincipal> {
  let identity: VerifiedSupabaseUser;
  try {
    identity = await authenticateSupabaseRequest(request);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "AUTH_REQUIRED") throw new Error("Authentication required");
    if (code === "AUTH_INVALID") throw new Error("Authentication invalid or expired");
    throw cause;
  }

  if (isAdminUid(identity.uid)) {
    return {
      firebaseUid: identity.uid,
      email: identity.email?.trim().toLowerCase() || `phone+${identity.uid}@users.vooye.invalid`,
      role: "ADMIN",
    };
  }

  // Preserve role-based access for accounts not explicitly allowlisted.
  // Do not create a customer record as a side effect of an admin authorization check.
  const user = await db.user.findUnique({ where: { firebaseUid: identity.uid } });
  if (!user || user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}
