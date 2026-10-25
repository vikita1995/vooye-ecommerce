import { isValidIndianPin } from "@/lib/validation";

/**
 * Checkout remains closed until the Supabase-backed commerce persistence path
 * has been implemented and verified end-to-end. The additional explicit
 * release gate prevents legacy Prisma configuration flags from accidentally
 * enabling checkout while the application still has split data models.
 */
export function isCheckoutReady(): boolean {
  if (process.env.SUPABASE_COMMERCE_CHECKOUT_READY !== "true") return false;
  if (process.env.CHECKOUT_ENABLED !== "true") return false;
  if (process.env.INVENTORY_EXPIRY_JOB_ENABLED !== "true") return false;
  if (process.env.PAYMENT_RECONCILIATION_ENABLED !== "true") return false;

  if (
    !process.env.DATABASE_URL ||
    !process.env.CRON_SECRET ||
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET ||
    !process.env.RAZORPAY_WEBHOOK_SECRET ||
    !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  ) {
    return false;
  }

  const shippingFee = Number(process.env.SHIPPING_FLAT_FEE_PAISE);
  if (!Number.isSafeInteger(shippingFee) || shippingFee < 0) return false;

  const rawPins = (process.env.SERVICEABLE_PIN_CODES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (rawPins.length === 0 || !rawPins.every(isValidIndianPin)) return false;

  return true;
}
