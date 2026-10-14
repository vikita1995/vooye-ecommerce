
import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  handleApiError,
  rateLimitRequest,
  requireUser,
  supabaseRest,
} from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SellerProfile = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function optionalString(
  value: unknown,
  maxLength: number
): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  if (trimmed.length > maxLength) return undefined;

  return trimmed || null;
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(phone: string): boolean {
  // Accept common international phone formatting.
  return /^[+()\d\s.-]{7,30}$/.test(phone);
}

function createStoreSlug(storeName: string, uid: string): string {
  const baseSlug =
    storeName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "store";

  // UID suffix helps prevent collisions between similar store names.
  return `${baseSlug}-${uid.slice(0, 8).toLowerCase()}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = supabaseRest("seller_profiles");

    const response = await fetch(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(
        user.uid
      )}&select=${SELLER_FIELDS}`,
      {
        headers: db.headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      console.error("Seller application lookup failed:", response.status);
      return apiError("Unable to load seller application.", 502);
    }

    const rows = (await response.json()) as SellerProfile[];

    return NextResponse.json(
      { seller: rows[0] ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    // Limit attempts per verified Firebase UID.
    // This in-memory limiter is per instance; use a shared store for
    // reliable limits across multiple Cloud Run instances.
    const rateLimitResponse = rateLimitRequest(request, {
      scope: "seller-application",
      key: user.uid,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return apiError("Invalid request body.", 400);
    }

    if (!isRecord(body)) {
      return apiError("Invalid application details.", 400);
    }

    // Reject unexpected properties, including attempts to submit status,
    // Firebase UID, or store slug from the browser.
    const allowedFields = new Set([
      "store_name",
      "description",
      "support_email",
      "phone",
    ]);

    if (Object.keys(body).some((field) => !allowedFields.has(field))) {
      return apiError("Application contains unsupported fields.", 400);
    }

    const storeName =
      typeof body.store_name === "string"
        ? body.store_name.trim()
        : "";

    if (storeName.length < 2 || storeName.length > 100) {
      return apiError(
        "Store name must be between 2 and 100 characters.",
        400
      );
    }

    const description = optionalString(body.description, 2000);
    const supportEmail = optionalString(body.support_email, 254);
    const phone = optionalString(body.phone, 30);

    if (description === undefined) {
      return apiError(
        "Description must be a string of 2,000 characters or fewer.",
        400
      );
    }

    if (supportEmail === undefined) {
      return apiError("Enter a valid contact email.", 400);
    }

    if (phone === undefined) {
      return apiError("Enter a valid contact phone number.", 400);
    }

    if (supportEmail && !validEmail(supportEmail)) {
      return apiError("Enter a valid contact email.", 400);
    }

    if (phone && !validPhone(phone)) {
      return apiError("Enter a valid contact phone number.", 400);
    }

    const resolvedEmail = supportEmail || user.email || null;
    const resolvedPhone = phone || user.phone_number || null;

    const storeSlug = createStoreSlug(storeName, user.uid);
    const db = supabaseRest("seller_profiles");

    // This lookup improves the user-facing error, but the database primary
    // key and unique slug constraint remain the final concurrency protection.
    const existingResponse = await fetch(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(
        user.uid
      )}&select=firebase_uid,status`,
      {
        headers: db.headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!existingResponse.ok) {
      console.error(
        "Seller application existence check failed:",
        existingResponse.status
      );
      return apiError(
        "Unable to check existing seller application.",
        502
      );
    }

    const existing = (await existingResponse.json()) as {
      firebase_uid: string;
      status: string;
    }[];

    if (existing.length > 0) {
      return apiError(
        "A seller application already exists for this account. Check its status in your seller portal.",
        409
      );
    }

    const response = await fetch(`${db.url}?select=${SELLER_FIELDS}`, {
      method: "POST",
      headers: {
        ...db.headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        // Identity and approval status are derived/set on the server.
        firebase_uid: user.uid,
        store_name: storeName,
        store_slug: storeSlug,
        description,
        support_email: resolvedEmail,
        phone: resolvedPhone,
        status: "pending",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // PostgREST commonly returns 409 for unique constraint violations.
      if (response.status === 409) {
        return apiError(
          "An application already exists or this store URL is unavailable.",
          409
        );
      }

      console.error("Seller application insert failed:", response.status);
      return apiError("Unable to submit seller application.", 502);
    }

    const rows = (await response.json()) as SellerProfile[];

    if (!rows[0]) {
      return apiError("Application was not saved.", 502);
    }

    return NextResponse.json(
      { seller: rows[0] },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
