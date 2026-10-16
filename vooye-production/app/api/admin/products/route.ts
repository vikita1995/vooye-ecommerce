
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";

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
  status: ProductStatus;
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
    return apiError(
      "Authentication required. Please sign in again.",
      401
    );
  }

  if (message === "Forbidden") {
    return apiError("Administrator access required.", 403);
  }

  if (message === "SUPABASE_CONFIG_MISSING") {
    return apiError("Product service is not configured.", 500);
  }

  console.error(
    "Admin product API error:",
    message || "Unknown error"
  );

  return apiError("The request could not be completed.", 500);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const status =
      request.nextUrl.searchParams.get("status") ?? "draft";

    if (!["draft", "active", "hidden", "all"].includes(status)) {
      return apiError(
        "Status must be draft, pending_review, approved, rejected, archived, or all.",
        400
      );
    }

    const db = supabaseRest("products");
    const statusFilter =
      status === "all"
        ? ""
        : `&status=eq.${encodeURIComponent(status)}`;

    const response = await fetchWithTimeout(
      `${db.url}?select=${PRODUCT_FIELDS}${statusFilter}&order=created_at.desc&limit=100`,
      { headers: db.headers }
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

export async function PATCH(request: NextRequest) {
  try {
    // Authorization must happen before database access.
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

    if (
      Object.keys(input).some(
        (field) => !allowedFields.has(field)
      )
    ) {
      return apiError(
        "Moderation request contains unsupported fields.",
        400
      );
    }

    const productId =
      typeof input.product_id === "string"
        ? input.product_id.trim()
        : "";

    const nextStatus = input.status;

    if (!productId || productId.length > 128) {
      return apiError("A valid product ID is required.", 400);
    }

    if (
      nextStatus !== "approved" &&
      nextStatus !== "rejected" &&
      nextStatus !== "archived" &&
      nextStatus !== "draft"
    ) {
      return apiError(
        "Status must be approved, rejected, archived, or draft.",
        400
      );
    }

    const db = supabaseRest("products");

    // Read the current status before validating the transition.
    const lookup = await fetchWithTimeout(
      `${db.url}?id=eq.${encodeURIComponent(productId)}&select=id,status&limit=1`,
      { headers: db.headers }
    );

    if (!lookup.ok) {
      console.error(
        "Admin product status lookup failed:",
        lookup.status
      );
      return apiError("Unable to check product status.", 502);
    }

    const currentRows = (await lookup.json()) as {
      id: string;
      status: ProductStatus;
    }[];

    const current = currentRows[0];

    if (!current) {
      return apiError("Product not found.", 404);
    }

    const allowedTransitions: Record<ProductStatus, ProductStatus[]> = {
      draft: ["approved", "rejected", "archived"],
      pending_review: ["approved", "rejected", "archived"],
      approved: ["archived"],
      rejected: ["draft", "archived"],
      archived: ["approved", "draft"],
    };

    if (!allowedTransitions[current.status]?.includes(
      nextStatus
    )) {
      return apiError(
        `Cannot change product status from ${current.status} to ${nextStatus}.`,
        409
      );
    }

    // Compare-and-set: update only if the status still matches
    // what we read. This protects against concurrent status changes.
    const response = await fetchWithTimeout(
      `${db.url}?id=eq.${encodeURIComponent(productId)}&status=eq.${encodeURIComponent(current.status)}&select=${PRODUCT_FIELDS}`,
      {
        method: "PATCH",
        headers: {
          ...db.headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: nextStatus }),
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
      return apiError(
        "Product status changed concurrently. Reload and retry.",
        409
      );
    }

    return NextResponse.json(
      { product },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}
