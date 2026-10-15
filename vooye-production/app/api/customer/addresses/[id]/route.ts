
import { NextRequest, NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function context(request: NextRequest) {
  const decoded = await authenticateSupabaseRequest(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CONFIG_MISSING");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const response = await fetch(
    `${url}/rest/v1/customers?firebase_uid=eq.${encodeURIComponent(decoded.uid)}&select=id,status`,
    { headers, cache: "no-store" }
  );
  if (!response.ok) throw new Error("LOOKUP_FAILED");

  const rows = (await response.json()) as { id: string; status: string }[];
  const customer = rows[0];
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  if (customer.status !== "active") throw new Error("CUSTOMER_INACTIVE");

  return { url, headers, customer };
}

async function addressIdFrom(
  contextValue: Awaited<ReturnType<typeof context>>,
  id: string
) {
  const response = await fetch(
    `${contextValue.url}/rest/v1/customer_addresses?id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(contextValue.customer.id)}&select=id`,
    { headers: contextValue.headers, cache: "no-store" }
  );

  if (!response.ok) throw new Error("ADDRESS_LOOKUP_FAILED");
  const rows = (await response.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

function handleError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  const known: Record<string, [string, number]> = {
    AUTH_REQUIRED: ["Please sign in first.", 401],
    AUTH_INVALID: ["Your session has expired. Please sign in again.", 401],
    CONFIG_MISSING: ["Address service is not configured.", 500],
    LOOKUP_FAILED: ["Unable to verify your customer account.", 502],
    CUSTOMER_NOT_FOUND: ["Customer profile not found.", 404],
    CUSTOMER_INACTIVE: ["This customer account is inactive.", 403],
    ADDRESS_LOOKUP_FAILED: ["Unable to verify this address.", 502],
  };

  if (known[message]) {
    const [text, status] = known[message];
    return error(text, status);
  }

  console.error("Customer address item API error:", cause);
  return error("Unable to process this address.", 500);
}

async function validateBody(request: NextRequest) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return { error: "Invalid request body." };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Please provide valid address details." };
  }

  const body = input as Record<string, unknown>;
  const required = [
    "address_type",
    "recipient_name",
    "phone_e164",
    "address_line1",
    "locality",
    "city",
    "state",
    "postal_code",
  ];
  const maxLengths: Record<string, number> = {
    address_type: 30,
    recipient_name: 100,
    phone_e164: 20,
    address_line1: 200,
    address_line2: 200,
    landmark: 150,
    locality: 100,
    city: 100,
    state: 100,
    postal_code: 20,
    country_code: 2,
  };

  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return { error: `Please enter ${field.replaceAll("_", " ")}.` };
    }
  }

  for (const [field, max] of Object.entries(maxLengths)) {
    const value = body[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== "string" || value.trim().length > max) {
        return { error: `Invalid ${field.replaceAll("_", " ")}.` };
      }
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(String(body.phone_e164).trim())) {
    return { error: "Enter the phone number with country code, for example +919876543210." };
  }

  const country = String(body.country_code ?? "IN").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return { error: "Enter a valid two-letter country code." };
  }

  const data: Record<string, string | null> = {};
  for (const field of Object.keys(maxLengths)) {
    if (field === "country_code") continue;
    const value = body[field];
    data[field] =
      typeof value === "string" && value.trim() ? value.trim() : null;
  }
  data.country_code = country;

  return { data };
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await context(request);
    const { id } = await params;

    const validId = await addressIdFrom(ctx, id);
    if (!validId) return error("Address not found.", 404);

    const result = await validateBody(request);
    if ("error" in result) return error(result.error!, 400);

    const response = await fetch(
      `${ctx.url}/rest/v1/customer_addresses?id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(ctx.customer.id)}&select=*`,
      {
        method: "PATCH",
        headers: { ...ctx.headers, Prefer: "return=representation" },
        body: JSON.stringify({
          ...result.data,
          updated_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Address update failed:", response.status, await response.text());
      return error("Unable to update this address.", 502);
    }

    const rows = await response.json();
    if (!rows[0]) return error("Address not found.", 404);
    return NextResponse.json({ address: rows[0] });
  } catch (cause) {
    return handleError(cause);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await context(request);
    const { id } = await params;

    const response = await fetch(
      `${ctx.url}/rest/v1/customer_addresses?id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(ctx.customer.id)}&select=id`,
      {
        method: "DELETE",
        headers: { ...ctx.headers, Prefer: "return=representation" },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Address delete failed:", response.status, await response.text());
      return error("Unable to delete this address.", 502);
    }

    const rows = (await response.json()) as { id: string }[];
    if (!rows.length) return error("Address not found.", 404);
    return NextResponse.json({ success: true });
  } catch (cause) {
    return handleError(cause);
  }
}
