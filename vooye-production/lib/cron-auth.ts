import crypto from "node:crypto";

/**
 * Validate a cron endpoint's Bearer token without leaking timing information
 * about the configured secret.
 */
export function isAuthorizedBearer(request: Request, expectedSecret: string | undefined): boolean {
  const expected = expectedSecret ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";

  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, providedBytes);
}
