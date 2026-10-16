/**
 * Lightweight admin UID allowlist shared with middleware.
 * This module must not import Prisma or other server data-access modules.
 */
export function isAdminUid(uid: string): boolean {
  const allowed = (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return Boolean(uid) && allowed.includes(uid);
}
