import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseAdmin } from "@/lib/firebase/require-admin";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFirebaseAdmin(request);
    const db = supabaseRest("products");
    const response = await fetch(
      `${db.url}?select=id,seller_uid,name,slug,category,price_paise,stock,status,created_at,updated_at&order=created_at.desc&limit=500`,
      { headers: db.headers, cache: "no-store", signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) return apiError("Unable to load seller listings.", 502);
    const products = await response.json();
    return NextResponse.json({ products }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "Authentication required" || message === "Authentication invalid or expired") {
      return apiError("Please sign in again.", 401);
    }
    if (message === "Forbidden") return apiError("Administrator access is required.", 403);
    console.error("[admin-seller-dashboard] failed to load seller listings");
    return apiError("Unable to load seller dashboard.", 500);
  }
}
