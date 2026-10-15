
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Product = {
  id: string;
  seller_uid: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  dimensions: string | null;
  price_paise: number;
  stock: number;
  status: string;
  created_at: string;
  updated_at: string;
};

const PRODUCT_FIELDS =
  "id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at,updated_at";

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
    return apiError("Product service is not configured.", 500);
  }

  console.error(
    "Admin product moderation API error:",
    message || "Unknown error"
  );

  return apiError("The request could not be completed.", 500);
}

/**
 * GET /api/admin/products
 * GET /api/admin/products?status=draft
 * GET /api/admin/products?status=all
 *
 * Lists products for administrator moderation.
 * Defaults to draft products.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const requestedStatus =
      request.nextUrl.searchParams.get("status") ?? "draft";

    const allowedStatuses = new Set([
      "draft",
      "active",
      "hidden",
      "all",
    ]);

    if (!allowedStatuses.has(requestedStatus)) {
      return apiError(
        "Status must be draft, active, hidden, or all.",
        400
      );
    }

    const db = supabaseRest("products");

    const statusFilter =
      requestedStatus === "all"
        ? ""
        : `&status=eq.${encodeURIComponent(requestedStatus)}`;

    const response = await fetch(
      `${db.url}?select=${PRODUCT_FIELDS}${statusFilter}&order=created_at.desc&limit=100`,
      {
        headers: db.headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      console.error(
        "Admin product lookup failed:",
        response.status
      );

      return apiError("Unable to load products.", 502);
    }

    const products = (await response.json()) as Product[];

    return NextResponse.json(
      { products },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/products
 *
 * Body:
 * {
 *   "product_id": "product-id",
 *   "status": "active"
 * }
 *
 * Supported moderation actions:
 * - active: approve or make a product visible
 * - hidden: hide a product from customers
 *
 * Only the status field can be changed through this endpoint.
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
      return apiError("Invalid moderation details.", 400);
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["product_id", "status"]);

    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      return apiError(
        "Moderation request contains unsupported fields.",
        400
      );
    }

    const productId =
      typeof input.product_id === "string"
        ? input.product_id.trim()
        : "";

    const status = input.status;

    if (!productId || productId.length > 128) {
      return apiError("A valid product ID is required.", 400);
    }

    if (status !== "active" && status !== "hidden") {
      return apiError(
        "Status must be active or hidden.",
        400
      );
    }

    const db = supabaseRest("products");

    const response = await fetch(
      `${db.url}?id=eq.${encodeURIComponent(productId)}&select=${PRODUCT_FIELDS}`,
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
        "Admin product moderation update failed:",
        response.status
      );

      return apiError("Unable to update product status.", 502);
    }

    const products = (await response.json()) as Product[];
    const product = products[0];

    if (!product) {
      return apiError("Product not found.", 404);
    }

    return NextResponse.json(
      { product },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}
