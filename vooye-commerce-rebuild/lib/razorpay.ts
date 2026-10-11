import "server-only";
import Razorpay from "razorpay";
let client: Razorpay | null = null;
export function getRazorpay() {
  const key_id=process.env.RAZORPAY_KEY_ID, key_secret=process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  if (!client) client = new Razorpay({ key_id, key_secret });
  return client;
}
