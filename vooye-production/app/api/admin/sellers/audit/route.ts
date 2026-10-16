import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditEvent = {
  id: string;
  seller_firebase_uid: string;
  previous_status: string;
  new_status: string;
  reason: string | null;
  admin_firebase_uid: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const firebaseUid = request.nextUrl.searchParams.get("firebase_uid")?.trim() ?? "";
    if (!firebaseUid || firebaseUid.length > 128) {
      return apiError("A valid seller Firebase UID is required.", 400);
    }

    const db = supabaseRest("seller_application_audit");
    const query = new URLSearchParams({
      select: "id,seller_firebase_uid,previous_status,new_status,reason,admin_firebase_uid,created_at",
      seller_firebase_uid: `eq.${firebaseUid}`,
      order: "created_at.desc",
      limit: "100",
    });
    const response = await fetch(`${db.url}?${query.toString()}`, {
      headers: db.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("Seller audit history lookup failed:", response.status);
      return apiError("Unable to load seller audit history.", 502);
    }

    const events = (await response.json()) as AuditEvent[];
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "Authentication required" || message === "Authentication invalid or expired") {
      return apiError("Administrator sign-in is required.", 401);
    }
    if (message === "Forbidden") return apiError("Administrator access required.", 403);
    console.error("Seller audit history API failed:", message || "Unknown error");
    return apiError("Unable to load seller audit history.", 500);
  }
}
