import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  handleApiError,
  requireUser,
  rateLimitRequest,
  supabaseRest,
} from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SellerRow = {
  firebase_uid: string;
  status: string;
};

type ProductRow = {
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

type SellerPermission =
  | { ok: true; seller: SellerRow }
  | { ok: false; error: string; status: number };

async function getApprovedSeller(
  uid: string
): Promise<SellerPermission> {
  const db = supabaseRest("seller_profiles");

  const response = await fetch(
    `${db.url}?firebase_uid=eq.${encodeURIComponent(uid)}&select=firebase_uid,status`,
    {
      headers: db.headers,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("SELLER_LOOKUP_FAILED");
  }

  const sellers = (await response.json()) as SellerRow[];
  const seller = sellers[0];

  if (!seller) {
    return {
      ok: false,
      error: "Apply to become a seller first.",
      status: 403,
    };
  }

  if (seller.status !== "approved") {
    return {
      ok: false,
      error:
        "Your seller application must be approved before you can manage products.",
      status: 403,
    };
  }

  return { ok: true, seller };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = supabaseRest("products");

    const response = await fetch(
      `${db.url}?seller_uid=eq.${encodeURIComponent(user.uid)}&select=id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at,updated_at&order=created_at.desc`,
      {
        headers: db.headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return apiError("Unable to load your products.", 502);
    }

    const products = (await response.json()) as ProductRow[];

    return NextResponse.json({ products });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request first.
    const user = await requireUser(request);

    // Limit each authenticated seller to 10 product-creation
    // requests per 60-second window.
    const rateLimitResponse = rateLimitRequest(request, {
      scope: "seller-product-create",
      key: user.uid,
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Only approved sellers can create products.
    const permission = await getApprovedSeller(user.uid);

    if (!permission.ok) {
      return apiError(permission.error, permission.status);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return apiError("Invalid product details.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid product details.", 400);
    }

    const input = body as Record<string, unknown>;

    const name =
      typeof input.name === "string" ? input.name.trim() : "";

    const category =
      typeof input.category === "string" ? input.category.trim() : "";

    const description =
      typeof input.description === "string"
        ? input.description.trim()
        : "";

    const dimensions =
      typeof input.dimensions === "string"
        ? input.dimensions.trim()
        : "";

    // The UI sends rupees; the database stores integer paise.
    const priceRupees =
      typeof input.price_rupees === "number"
        ? input.price_rupees
        : Number(input.price_rupees);

    const stock =
      typeof input.stock === "number"
        ? input.stock
        : Number(input.stock);

    if (name.length < 3 || name.length > 160) {
      return apiError(
        "Product name must be between 3 and 160 characters.",
        400
      );
    }

    if (category.length < 2 || category.length > 80) {
      return apiError("Enter a valid product category.", 400);
    }

    if (!description || description.length > 5000) {
      return apiError(
        "Description is required and must be under 5,000 characters.",
        400
      );
    }

    if (
      !Number.isFinite(priceRupees) ||
      priceRupees <= 0 ||
      priceRupees > 10000000 ||
      Math.round(priceRupees * 100) !== priceRupees * 100
    ) {
      return apiError(
        "Enter a valid price in rupees, with at most 2 decimal places.",
        400
      );
    }

    if (
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1000000
    ) {
      return apiError(
        "Stock must be a whole number between 0 and 1,000,000.",
        400
      );
    }

    if (dimensions.length > 200) {
      return apiError(
        "Dimensions must be 200 characters or fewer.",
        400
      );
    }

    const baseSlug = slugify(name);

    if (!baseSlug) {
      return apiError("Choose a different product name.", 400);
    }

    const db = supabaseRest("products");
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const response = await fetch(
      `${db.url}?select=id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at,updated_at`,
      {
        method: "POST",
        headers: {
          ...db.headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          // Ownership comes from the verified Firebase token.
          // Never accept seller_uid or status from the request body.
          seller_uid: user.uid,
          slug,
          name,
          category,
          description,
          dimensions: dimensions || null,
          price_paise: Math.round(priceRupees * 100),
          stock,
          status: "draft",
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Product creation failed:", response.status);
      return apiError("Unable to create the product.", 502);
    }

    const rows = (await response.json()) as ProductRow[];

    if (!rows[0]) {
      return apiError("Product was not saved.", 502);
    }

    return NextResponse.json(
      { product: rows[0] },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
