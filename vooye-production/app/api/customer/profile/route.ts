
import { NextRequest, NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/supabase/verify-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authenticate(request: NextRequest) {
  return authenticateSupabaseRequest(request);
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("PROFILE_CONFIG_MISSING");
  }

  return {
    baseUrl: `${url.replace(/\/+$/, "")}/rest/v1/customers`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
}

type Customer = {
  id: string;
  firebase_uid: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  registration_completed_at: string | null;
  status: string;
};

const CUSTOMER_FIELDS =
  "id,firebase_uid,full_name,email,phone_e164,email_verified_at,phone_verified_at,date_of_birth,gender,registration_completed_at,status";

async function findCustomer(
  baseUrl: string,
  headers: Record<string, string>,
  uid: string
): Promise<Customer | null> {
  const response = await fetch(
    `${baseUrl}?firebase_uid=eq.${encodeURIComponent(uid)}&select=${CUSTOMER_FIELDS}`,
    {
      headers,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    console.error("Customer lookup failed:", response.status);
    throw new Error("PROFILE_LOOKUP_FAILED");
  }

  const customers = (await response.json()) as Customer[];
  return customers[0] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const { baseUrl, headers } = getSupabaseConfig();

    // Look up the profile using the authenticated Firebase UID.
    let customer = await findCustomer(
      baseUrl,
      headers,
      decoded.uid
    );

    if (!customer) {
      const email = decoded.email?.trim().toLowerCase() || null;
      const phone = decoded.phone_number?.trim() || null;

      const fullName =
        decoded.name?.trim() ||
        decoded.email?.split("@")[0]?.trim() ||
        null;

      if (!email && !phone) {
        return jsonError(
          "Your account needs an email address or verified phone number.",
          422
        );
      }

      // Phone-only Firebase accounts may not have a display name.
      // The customers.full_name column must allow NULL for these accounts.
      const newCustomer = {
        firebase_uid: decoded.uid,
        full_name: fullName,
        email,
        phone_e164: phone,
        ...(email && decoded.email_verified
          ? { email_verified_at: new Date().toISOString() }
          : {}),
        ...(phone
          ? { phone_verified_at: new Date().toISOString() }
          : {}),
      };

      const createResponse = await fetch(
        `${baseUrl}?on_conflict=firebase_uid&select=${CUSTOMER_FIELDS}`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: JSON.stringify(newCustomer),
          cache: "no-store",
        }
      );

      if (!createResponse.ok) {
        // Avoid logging database response bodies.
        console.error(
          "Customer profile creation failed:",
          createResponse.status
        );
        return jsonError("Unable to create customer profile.", 502);
      }

      const created = (await createResponse.json()) as Customer[];

      // Handle concurrent requests or an existing UID safely.
      customer =
        created[0] ??
        (await findCustomer(baseUrl, headers, decoded.uid));
    }

    if (!customer) {
      return jsonError("Customer profile was not found.", 404);
    }

    if (customer.status !== "active") {
      return jsonError("This customer account is not active.", 403);
    }

    return NextResponse.json({ customer });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return jsonError("Authentication required.", 401);
      }

      if (error.message === "AUTH_INVALID") {
        return jsonError(
          "Your sign-in session is invalid or expired. Please sign in again.",
          401
        );
      }

      if (error.message === "PROFILE_CONFIG_MISSING") {
        return jsonError(
          "Customer profile service is not configured.",
          500
        );
      }

      if (error.message === "PROFILE_LOOKUP_FAILED") {
        return jsonError(
          "Unable to look up your customer profile.",
          502
        );
      }
    }

    console.error(
      "Customer profile GET error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to load your customer profile.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const { baseUrl, headers } = getSupabaseConfig();

    const customer = await findCustomer(
      baseUrl,
      headers,
      decoded.uid
    );

    if (!customer) {
      return jsonError(
        "Customer profile was not found. Load your account first.",
        404
      );
    }

    if (customer.status !== "active") {
      return jsonError("This customer account is not active.", 403);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON request.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid profile data.", 400);
    }

    const input = body as Record<string, unknown>;
    const allowedFields = [
      "full_name",
      "date_of_birth",
      "gender",
    ];

    if (
      Object.keys(input).length === 0 ||
      Object.keys(input).some(
        (key) => !allowedFields.includes(key)
      )
    ) {
      return jsonError(
        "Only full name, date of birth and gender can be updated here.",
        400
      );
    }

    const updates: Record<string, string | null> = {};

    if ("full_name" in input) {
      if (
        typeof input.full_name !== "string" ||
        input.full_name.trim().length < 2 ||
        input.full_name.trim().length > 100
      ) {
        return jsonError(
          "Enter a name between 2 and 100 characters.",
          400
        );
      }

      updates.full_name = input.full_name.trim();
    }

    if ("date_of_birth" in input) {
      if (input.date_of_birth === null || input.date_of_birth === "") {
        updates.date_of_birth = null;
      } else if (typeof input.date_of_birth === "string") {
        const date = input.date_of_birth;
        const parsed = new Date(`${date}T00:00:00.000Z`);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== date ||
          parsed > today ||
          date < "1900-01-01"
        ) {
          return jsonError("Enter a valid date of birth.", 400);
        }

        updates.date_of_birth = date;
      } else {
        return jsonError("Invalid date of birth.", 400);
      }
    }

    if ("gender" in input) {
      if (
        input.gender !== null &&
        !["male", "female", "other"].includes(
          input.gender as string
        )
      ) {
        return jsonError(
          "Choose Male, Female, Other, or leave it blank.",
          400
        );
      }

      updates.gender = input.gender as string | null;
    }

    const response = await fetch(
      `${baseUrl}?firebase_uid=eq.${encodeURIComponent(decoded.uid)}&select=${CUSTOMER_FIELDS}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Customer profile update failed:", response.status);
      return jsonError(
        "Unable to save your profile. Please try again.",
        502
      );
    }

    const updated = (await response.json()) as Customer[];

    if (!updated[0]) {
      return jsonError(
        "Your profile was not updated. Please try again.",
        409
      );
    }

    return NextResponse.json({ customer: updated[0] });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return jsonError("Authentication required.", 401);
      }

      if (error.message === "AUTH_INVALID") {
        return jsonError(
          "Your sign-in session is invalid or expired. Please sign in again.",
          401
        );
      }

      if (error.message === "PROFILE_CONFIG_MISSING") {
        return jsonError(
          "Customer profile service is not configured.",
          500
        );
      }

      if (error.message === "PROFILE_LOOKUP_FAILED") {
        return jsonError(
          "Unable to look up your customer profile.",
          502
        );
      }
    }

    console.error(
      "Customer profile PATCH error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError("Unable to save your profile.", 500);
  }
}
