
import { NextRequest, NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await authenticateSupabaseRequest(request);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return fail("Invalid request body.", 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).phone_number !== "string"
    ) {
      return fail("A verified phone number is required.", 400);
    }

    const requestedPhone = (
      body as Record<string, string>
    ).phone_number.trim();

    if (!/^\+[1-9]\d{7,14}$/.test(requestedPhone)) {
      return fail("Enter a valid international phone number.", 400);
    }

    // Trust only a phone number confirmed by Supabase Auth.
    if (!decoded.phone_verified || decoded.phone_number !== requestedPhone) {
      return fail(
        "Supabase Auth has not verified this number on your account.",
        403
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return fail("Phone verification service is not configured.", 500);
    }

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const customerUrl =
      `${url}/rest/v1/customers?firebase_uid=eq.${encodeURIComponent(decoded.uid)}`;

    const lookup = await fetch(
      `${customerUrl}&select=id,status`,
      { headers, cache: "no-store" }
    );

    if (!lookup.ok) {
      console.error("Phone customer lookup failed:", lookup.status);
      return fail("Unable to find your customer profile.", 502);
    }

    const customers = (await lookup.json()) as {
      id: string;
      status: string;
    }[];

    const customer = customers[0];

    if (!customer) return fail("Customer profile not found.", 404);
    if (customer.status !== "active") {
      return fail("This customer account is inactive.", 403);
    }

    const update = await fetch(
      `${customerUrl}&select=id,phone_e164,phone_verified_at`,
      {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          phone_e164: requestedPhone,
          phone_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!update.ok) {
      console.error("Phone profile update failed:", update.status);
      return fail(
        "Unable to save this number. It may already belong to another customer.",
        409
      );
    }

    const rows = (await update.json()) as {
      id: string;
      phone_e164: string;
      phone_verified_at: string;
    }[];

    if (!rows[0]) {
      return fail("Your phone number was not saved.", 409);
    }

    return NextResponse.json({ success: true, phone: rows[0] });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "";
    if (reason === "AUTH_REQUIRED") return fail("Please sign in first.", 401);
    if (reason === "AUTH_INVALID") return fail("Your session is invalid or expired. Please sign in again.", 401);
    if (reason === "AUTH_SERVICE_UNAVAILABLE") return fail("Authentication service is temporarily unavailable.", 503);
    console.error("Customer phone API error:", reason || "Unknown error");
    return fail("Unable to update your phone number.", 500);
  }
}
