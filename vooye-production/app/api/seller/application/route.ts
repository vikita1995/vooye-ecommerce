
import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  handleApiError,
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = supabaseRest("seller_profiles");

    const response = await fetch(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(user.uid)}&select=firebase_uid,store_name,store_slug,description,support_email,phone,status,created_at`,
      { headers: db.headers, cache: "no-store" }
    );

    if (!response.ok) return apiError("Unable to load seller application.", 502);

    const rows = (await response.json()) as SellerProfile[];
    return NextResponse.json({ seller: rows[0] ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid application details.", 400);
    }

    const input = body as Record<string, unknown>;
    const storeName =
      typeof input.store_name === "string" ? input.store_name.trim() : "";
    const description =
      typeof input.description === "string"
        ? input.description.trim()
        : "";
    const supportEmail =
      typeof input.support_email === "string"
        ? input.support_email.trim().toLowerCase()
        : "";
    const phone =
      typeof input.phone === "string" ? input.phone.trim() : "";

    if (storeName.length < 2 || storeName.length > 100) {
      return apiError("Store name must be between 2 and 100 characters.", 400);
    }

    if (description.length > 2000) {
      return apiError("Description must be 2,000 characters or fewer.", 400);
    }

    if (
      supportEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
    ) {
      return apiError("Enter a valid contact email.", 400);
    }

    if (phone.length > 30) {
      return apiError("Enter a valid contact phone number.", 400);
    }

    // Derive the slug on the server; never accept ownership or status
    // from the browser.
    const baseSlug =
      storeName
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "store";

    const storeSlug = `${baseSlug}-${user.uid.slice(0, 8).toLowerCase()}`;

    const db = supabaseRest("seller_profiles");

    const existingResponse = await fetch(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(user.uid)}&select=firebase_uid,status`,
      { headers: db.headers, cache: "no-store" }
    );

    if (!existingResponse.ok) {
      return apiError("Unable to check existing seller application.", 502);
    }

    const existing = (await existingResponse.json()) as {
      firebase_uid: string;
      status: string;
    }[];

    if (existing.length) {
      return apiError(
        "A seller application already exists for this account. Check its status in your seller portal.",
        409
      );
    }

    const response = await fetch(
      `${db.url}?select=firebase_uid,store_name,store_slug,description,support_email,phone,status,created_at`,
      {
        method: "POST",
        headers: {
          ...db.headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          firebase_uid: user.uid,
          store_name: storeName,
          store_slug: storeSlug,
          description: description || null,
          support_email: supportEmail || user.email || null,
          phone: phone || user.phone_number || null,
          status: "pending",
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Seller application insert failed:", response.status);
      return apiError(
        "Unable to submit application. The store URL may already be in use.",
        409
      );
    }

    const rows = (await response.json()) as SellerProfile[];
    if (!rows[0]) return apiError("Application was not saved.", 502);

    return NextResponse.json({ seller: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
