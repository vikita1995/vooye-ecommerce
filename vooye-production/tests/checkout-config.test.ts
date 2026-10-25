import { afterEach, describe, expect, it } from "vitest";
import { isCheckoutReady } from "../lib/checkout-config";

const names = [
  "SUPABASE_COMMERCE_CHECKOUT_READY",
  "CHECKOUT_ENABLED",
  "INVENTORY_EXPIRY_JOB_ENABLED",
  "PAYMENT_RECONCILIATION_ENABLED",
  "DATABASE_URL",
  "CRON_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "SHIPPING_FLAT_FEE_PAISE",
  "SERVICEABLE_PIN_CODES",
] as const;

const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setAllLegacyRequirements() {
  process.env.CHECKOUT_ENABLED = "true";
  process.env.INVENTORY_EXPIRY_JOB_ENABLED = "true";
  process.env.PAYMENT_RECONCILIATION_ENABLED = "true";
  process.env.DATABASE_URL = "postgresql://example.invalid/db";
  process.env.CRON_SECRET = "test-only";
  process.env.RAZORPAY_KEY_ID = "test-key";
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook";
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "test-public-key";
  process.env.SHIPPING_FLAT_FEE_PAISE = "9900";
  process.env.SERVICEABLE_PIN_CODES = "500001,110001";
}

describe("checkout release gate", () => {
  it("keeps checkout closed when the Supabase commerce gate is absent", () => {
    setAllLegacyRequirements();
    delete process.env.SUPABASE_COMMERCE_CHECKOUT_READY;

    expect(isCheckoutReady()).toBe(false);
  });

  it("keeps checkout closed when the Supabase commerce gate is false", () => {
    setAllLegacyRequirements();
    process.env.SUPABASE_COMMERCE_CHECKOUT_READY = "false";

    expect(isCheckoutReady()).toBe(false);
  });

  it("still requires all existing release prerequisites after the new gate is set", () => {
    setAllLegacyRequirements();
    process.env.SUPABASE_COMMERCE_CHECKOUT_READY = "true";

    expect(isCheckoutReady()).toBe(true);
  });

  it("rejects an invalid shipping PIN even when all flags are enabled", () => {
    setAllLegacyRequirements();
    process.env.SUPABASE_COMMERCE_CHECKOUT_READY = "true";
    process.env.SERVICEABLE_PIN_CODES = "123";

    expect(isCheckoutReady()).toBe(false);
  });
});
