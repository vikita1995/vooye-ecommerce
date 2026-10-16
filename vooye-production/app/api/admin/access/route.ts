import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseAdmin } from "@/lib/firebase/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireFirebaseAdmin(request);
    return NextResponse.json(
      { ok: true, uid: user.firebaseUid },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "Authentication required" || message === "Authentication invalid or expired") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }
    console.error("[admin-access] verification failed");
    return NextResponse.json({ error: "Unable to verify administrator access." }, { status: 500 });
  }
}
