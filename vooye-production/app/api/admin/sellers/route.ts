
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SellerApplication = {
  firebase_uid: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  support_email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

const SELLER_FIELDS =
  "firebase_uid,store_name,store_slug,description,support_email,phone,status,created_at";

function handleAdminError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message === "Authentication required" ||
    message === "Authentication invalid or expired" ||
    message === "Verified account email required"
  ) {
    return apiError("Authentication required. Please sign in again.", 401);
  }

  if (message === "Forbidden") {
    return apiError("Administrator access required.", 403);
  }

  if (message === "SUPABASE_CONFIG_MISSING") {
    return apiError("Seller service is not configured.", 500);
  }

  console.error(
    "Admin seller applications API error:",
    message || "Unknown error"
  );

  return apiError("The request could not be completed.", 500);
}

/**
 * GET /api/admin/sellers
 * GET /api/admin/sellers?status=all
 *
 * Lists seller applications. Defaults to pending applications.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const requestedStatus =
      request.nextUrl.searchParams.get("status") ?? "pending";

    const allowedStatuses = new Set([
      "pending",
      "approved",
      "rejected",
      "suspended",
      "all",
    ]);

    if (!allowedStatuses.has(requestedStatus)) {
      return apiError(
        "Status must be pending, approved, rejected, suspended, or all.",
        400
      );
    }

    const db = supabaseRest("seller_profiles");

    const statusFilter =
      requestedStatus === "all"
        ? ""
        : `&status=eq.${encodeURIComponent(requestedStatus)}`;

    const response = await fetch(
      `${db.url}?select=${SELLER_FIELDS}${statusFilter}&order=created_at.desc&limit=100`,
      {
        headers: db.headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      console.error(
        "Admin seller application lookup failed:",
        response.status
      );

      return apiError("Unable to load seller applications.", 502);
    }

    const applications =
      (await response.json()) as SellerApplication[];

    return NextResponse.json(
      { applications },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/sellers
 *
 * Body:
 * {
 *   "firebase_uid": "seller-firebase-uid",
 *   "status": "approved"
 * }
 *
 * Only pending applications can be reviewed.
 */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid review details.", 400);
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["firebase_uid", "status", "reason"]);
    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      return apiError("Review contains unsupported fields.", 400);
    }

    const firebaseUid = typeof input.firebase_uid === "string" ? input.firebase_uid.trim() : "";
    const status = typeof input.status === "string" ? input.status : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";

    if (!firebaseUid || firebaseUid.length > 128) {
      return apiError("A valid seller Firebase UID is required.", 400);
    }
    if (!["approved", "rejected", "suspended"].includes(status)) {
      return apiError("Status must be approved, rejected, or suspended.", 400);
    }
    if (["rejected", "suspended"].includes(status) && reason.length < 5) {
      return apiError("Enter a reason of at least 5 characters for rejection or suspension.", 400);
    }
    if (reason.length > 1000) return apiError("Review reason must be 1,000 characters or fewer.", 400);

    // The database function locks the seller row, validates the transition,
    // updates the status and inserts the audit event in a single transaction.
    const db = supabaseRest("rpc/review_seller_application");
    const response = await fetch(db.url, {
      method: "POST",
      headers: db.headers,
      body: JSON.stringify({
        p_seller_firebase_uid: firebaseUid,
        p_next_status: status,
        p_reason: reason || null,
        p_admin_firebase_uid: admin.firebaseUid,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      let dbMessage = "";
      try {
        const payload = await response.json() as { message?: string; code?: string };
        dbMessage = payload.message || payload.code || "";
      } catch {
        // Do not expose a raw database error or query payload to the browser.
      }

      if (dbMessage === "SELLER_APPLICATION_NOT_FOUND" || dbMessage.includes("SELLER_APPLICATION_NOT_FOUND")) {
        return apiError("Seller application not found.", 404);
      }
      if (dbMessage === "INVALID_SELLER_STATUS_TRANSITION" || dbMessage.includes("INVALID_SELLER_STATUS_TRANSITION")) {
        return apiError("That seller status transition is not allowed. Refresh and try again.", 409);
      }
      if (dbMessage === "REASON_REQUIRED" || dbMessage.includes("REASON_REQUIRED")) {
        return apiError("A review reason is required for this status.", 400);
      }
      if (["INVALID_SELLER_UID", "INVALID_ADMIN_UID", "INVALID_SELLER_STATUS"].some((code) => dbMessage.includes(code))) {
        return apiError("Invalid seller review details.", 400);
      }

      console.error("Atomic seller review RPC failed:", response.status);
      return apiError("Unable to update seller application and audit history.", 502);
    }

    const result = await response.json() as {
      application?: SellerApplication;
      event?: {
        id: string;
        seller_firebase_uid: string;
        previous_status: string;
        new_status: string;
        reason: string | null;
        admin_firebase_uid: string;
        created_at: string;
      };
    };
    if (!result.application || !result.event) {
      console.error("Atomic seller review RPC returned an incomplete result.");
      return apiError("Seller review result was incomplete.", 502);
    }

    return NextResponse.json(
      { application: result.application, event: result.event },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}
