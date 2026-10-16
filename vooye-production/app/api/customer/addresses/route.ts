
import { NextRequest, NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";
import { isValidPostalCode, normalizeE164Phone } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function getContext(request: NextRequest) {
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
  if (!response.ok) throw new Error("CUSTOMER_LOOKUP_FAILED");

  const customers = (await response.json()) as { id: string; status: string }[];
  const customer = customers[0];
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  if (customer.status !== "active") throw new Error("CUSTOMER_INACTIVE");

  return { url, headers, customer };
}

function handleError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";

  const known: Record<string, { message: string; status: number }> = {
    AUTH_REQUIRED: { message: "Please sign in first.", status: 401 },
    AUTH_INVALID: { message: "Your session has expired. Please sign in again.", status: 401 },
    AUTH_SERVICE_UNAVAILABLE: { message: "Authentication service is temporarily unavailable.", status: 503 },
    CONFIG_MISSING: { message: "Address service is not configured.", status: 500 },
    CUSTOMER_LOOKUP_FAILED: { message: "Unable to verify your customer account.", status: 502 },
    CUSTOMER_NOT_FOUND: { message: "Customer profile not found. Open your account page first.", status: 404 },
    CUSTOMER_INACTIVE: { message: "This customer account is inactive.", status: 403 },
  };

  const result = known[message];
  if (result) return error(result.message, result.status);

  console.error("Customer addresses API error:", cause);
  return error("Unable to process your address request.", 500);
}

const FIELDS =
  "id,address_type,recipient_name,phone_e164,address_line1,address_line2,landmark,locality,city,state,postal_code,country_code,created_at,updated_at";

function validateAddress(input: unknown) {
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

  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return { error: `Please enter ${field.replaceAll("_", " ")}.` };
    }
  }

  const limits: Record<string, number> = {
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

  for (const [field, max] of Object.entries(limits)) {
    const value = body[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== "string" || value.trim().length > max) {
        return { error: `Invalid ${field.replaceAll("_", " ")}.` };
      }
    }
  }

  const postalCode = String(body.postal_code).trim();
  const countryForPostal = String(body.country_code ?? "IN").trim().toUpperCase();
  if (!isValidPostalCode(postalCode, countryForPostal)) {
    return { error: countryForPostal === "IN" ? "Enter a valid 6-digit Indian PIN code." : "Please enter a valid postal code." };
  }

  const phone = normalizeE164Phone(body.phone_e164);
  if (!phone) {
    return {
      error: "Enter the phone number with country code, for example +919876543210.",
    };
  }

  const addressType = String(body.address_type).trim().toLowerCase();
  if (addressType !== "shipping" && addressType !== "billing") {
    return { error: "Choose Shipping or Billing for this address." };
  }

  const country = String(body.country_code ?? "IN").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return { error: "Enter a valid two-letter country code." };
  }

  if (country !== "IN") {
    return { error: "Vooye currently accepts delivery addresses in India only." };
  }

  const clean: Record<string, string | null> = {};
  for (const field of Object.keys(limits)) {
    if (field === "country_code") continue;
    const value = body[field];
    clean[field] =
      typeof value === "string" && value.trim() ? value.trim() : null;
  }

  for (const field of required) {
    if (!clean[field]) return { error: `Please enter ${field.replaceAll("_", " ")}.` };
  }

  clean.address_type = addressType;
  clean.phone_e164 = phone;
  clean.country_code = country;
  return { data: clean };
}

export async function GET(request: NextRequest) {
  try {
    const { url, headers, customer } = await getContext(request);
    const response = await fetch(
      `${url}/rest/v1/customer_addresses?customer_id=eq.${encodeURIComponent(customer.id)}&select=${FIELDS}&order=created_at.desc`,
      { headers, cache: "no-store" }
    );

    if (!response.ok) {
      console.error("Address list request failed:", response.status);
      return error("Unable to load your addresses.", 502);
    }

    return NextResponse.json({ addresses: await response.json() });
  } catch (cause) {
    return handleError(cause);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, headers, customer } = await getContext(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("Invalid request body.", 400);
    }

    const result = validateAddress(body);
    if ("error" in result) return error(result.error!, 400);

    const response = await fetch(
      `${url}/rest/v1/customer_addresses?select=${FIELDS}`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          ...result.data,
          customer_id: customer.id,
          updated_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Address create failed:", response.status, await response.text());
      return error("Unable to save this address.", 502);
    }

    const rows = await response.json();
    return NextResponse.json({ address: rows[0] }, { status: 201 });
  } catch (cause) {
    return handleError(cause);
  }
}
