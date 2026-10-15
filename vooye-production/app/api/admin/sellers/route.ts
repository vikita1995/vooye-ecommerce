
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
      "all",
    ]);

    if (!allowedStatuses.has(requestedStatus)) {
      return apiError(
        "Status must be pending, approved, rejected, or all.",
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
    await requireAdmin(request);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return apiError("Invalid request body.", 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return apiError("Invalid review details.", 400);
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["firebase_uid", "status"]);

    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      return apiError("Review contains unsupported fields.", 400);
    }

    const firebaseUid =
      typeof input.firebase_uid === "string"
        ? input.firebase_uid.trim()
        : "";

    const status = input.status;

    if (!firebaseUid || firebaseUid.length > 128) {
      return apiError("A valid seller Firebase UID is required.", 400);
    }

    if (status !== "approved" && status !== "rejected") {
      return apiError("Status must be approved or rejected.", 400);
    }

    const db = supabaseRest("seller_profiles");

    const response = await fetch(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&status=eq.pending&select=${SELLER_FIELDS}`,
      {
        method: "PATCH",
        headers: {
          ...db.headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      console.error(
        "Admin seller application review failed:",
        response.status
      );

      return apiError("Unable to update seller application.", 502);
    }

    const applications =
      (await response.json()) as SellerApplication[];

    const application = applications[0];

    if (!application) {
      return apiError(
        "Pending application not found. It may already have been reviewed.",
        404
      );
    }

    return NextResponse.json(
      { application },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}
