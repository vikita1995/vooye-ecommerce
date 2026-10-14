
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import {
  getAuth,
  type DecodedIdToken,
} from "firebase-admin/auth";
import { Prisma, type User, type UserRole } from "@prisma/client";
import { db } from "@/lib/db";

const FIREBASE_ADMIN_APP_NAME = "vooye-auth";

function adminAuth() {
  const app =
    getApps().find(
      (item) => item.name === FIREBASE_ADMIN_APP_NAME
    ) ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId:
          process.env.FIREBASE_ADMIN_PROJECT_ID ??
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      FIREBASE_ADMIN_APP_NAME
    );

  return getAuth(app);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function normalizeEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

/**
 * Authenticate a Firebase user and return the local database user.
 *
 * This function does not synchronize profile fields for existing users.
 * Existing roles are never changed by authentication.
 */
export async function authenticate(
  request: Request
): Promise<User> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new Error("Authentication required");
  }

  let decoded: DecodedIdToken;

  try {
    // Verify signature, expiry and revocation.
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new Error("Authentication invalid or expired");
  }

  const email = normalizeEmail(decoded.email);

  if (!email) {
    throw new Error("Verified account email required");
  }

  // The Firebase UID is the stable identity key.
  const existingUser = await db.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (existingUser) {
    // Do not update email, display name, or role during authentication.
    return existingUser;
  }

  try {
    return await db.user.create({
      data: {
        firebaseUid: decoded.uid,
        email,
        displayName: decoded.name?.trim() || null,
        role: "CUSTOMER",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Another concurrent request may have created this UID already.
      const userCreatedConcurrently = await db.user.findUnique({
        where: { firebaseUid: decoded.uid },
      });

      if (userCreatedConcurrently) {
        return userCreatedConcurrently;
      }

      // The email may belong to a different Firebase UID.
      // Never automatically link or merge those accounts.
      throw new Error(
        "ACCOUNT_EMAIL_CONFLICT: This email is already associated with another account. Contact support."
      );
    }

    throw error;
  }
}

/**
 * Explicitly synchronize basic profile fields.
 *
 * Call this only from a profile-update flow after validating the
 * requested changes. It cannot change the user's role or Firebase UID.
 */
export async function syncUserProfile(
  user: User,
  decoded: DecodedIdToken
): Promise<User> {
  if (user.firebaseUid !== decoded.uid) {
    throw new Error("Forbidden");
  }

  const email = normalizeEmail(decoded.email);

  if (!email) {
    throw new Error("Verified account email required");
  }

  try {
    return await db.user.update({
      where: { id: user.id },
      data: {
        email,
        displayName: decoded.name?.trim() || null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error(
        "ACCOUNT_EMAIL_CONFLICT: This email is already associated with another account. Contact support."
      );
    }

    throw error;
  }
}

/**
 * Check permissions against the role stored in the database.
 * Never take a role from a client request.
 */
export function requireRole(user: User, roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw new Error("Forbidden");
  }
}

/**
 * Server-side admin allowlist.
 * Configure ADMIN_UIDS as a comma-separated list of Firebase UIDs.
 */
export function isAdminUid(uid: string): boolean {
  return (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(uid);
}
