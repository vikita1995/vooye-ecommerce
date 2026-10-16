export function normalizeE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function isValidIndianPin(value: unknown): boolean {
  return typeof value === "string" && /^[1-9]\d{5}$/.test(value.trim());
}

export function isValidPostalCode(value: unknown, countryCode: string): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (countryCode.trim().toUpperCase() === "IN") return isValidIndianPin(normalized);
  return /^[A-Za-z0-9 -]{3,20}$/.test(normalized);
}
