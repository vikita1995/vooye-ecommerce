import { describe, expect, it } from "vitest";
import { isValidIndianPin, isValidPostalCode, normalizeE164Phone } from "../lib/validation";

describe("shared address and phone validation", () => {
  it("normalizes formatted international phone numbers to E.164", () => {
    expect(normalizeE164Phone(" +91 (98765) 43210 ")).toBe("+919876543210");
    expect(normalizeE164Phone("+447700900123")).toBe("+447700900123");
  });

  it.each(["9876543210", "09123456789", "+91012", "+91abcdefghij", ""])(
    "rejects invalid E.164 phone number %s",
    (value) => expect(normalizeE164Phone(value)).toBeNull(),
  );

  it("accepts valid six-digit Indian PIN codes", () => {
    expect(isValidIndianPin("500001")).toBe(true);
    expect(isValidIndianPin("110001")).toBe(true);
  });

  it.each(["050001", "50001", "5000010", "50A001", ""])(
    "rejects invalid Indian PIN code %s",
    (value) => expect(isValidIndianPin(value)).toBe(false),
  );

  it("uses country-specific postal validation", () => {
    expect(isValidPostalCode("500001", "IN")).toBe(true);
    expect(isValidPostalCode("SW1A 1AA", "GB")).toBe(true);
    expect(isValidPostalCode("12", "GB")).toBe(false);
    expect(isValidPostalCode("050001", "IN")).toBe(false);
  });
});
