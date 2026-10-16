import { NextResponse } from "next/server";
import { isCheckoutReady } from "@/lib/checkout-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = isCheckoutReady();
  return NextResponse.json({
    enabled,
    message: enabled
      ? "Secure checkout is available."
      : "Checkout is temporarily unavailable while shipping, inventory expiry, and payment reconciliation are configured.",
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
