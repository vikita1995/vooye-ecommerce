
import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getFirebaseAuth() {
  const app =
    getApps().find((item) => item.name === "vooye-customer-profile") ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId:
          process.env.FIREBASE_ADMIN_PROJECT_ID ??
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      "vooye-customer-profile"
    );

  return getAuth(app);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return jsonError("Authentication required.", 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("Customer profile configuration is missing.");
      return jsonError("Customer profile service is not configured.", 500);
    }

    const decoded = await getFirebaseAuth().verifyIdToken(token);
    const firebaseUid = decoded.uid;

    const email = decoded.email?.trim().toLowerCase() || null;
    const phone = decoded.phone_number?.trim() || null;
    const fullName =
      decoded.name?.trim() ||
      decoded.email?.split("@")[0]?.trim() ||
      null;

    const baseUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/customers`;

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const findResponse = await fetch(
      `${baseUrl}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=id,firebase_uid,full_name,email,phone_e164,email_verified_at,phone_verified_at,registration_completed_at,status`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      }
    );

    if (!findResponse.ok) {
      console.error("Customer profile lookup failed:", findResponse.status);
      return jsonError("Unable to load customer profile.", 502);
    }

    const customers = (await findResponse.json()) as Array<{
      id: string;
      firebase_uid: string;
      full_name: string | null;
      email: string | null;
      phone_e164: string | null;
      email_verified_at: string | null;
      phone_verified_at: string | null;
      registration_completed_at: string | null;
      status: string;
    }>;

    let customer = customers[0];

    if (!customer) {
      if (!email && !phone) {
        return jsonError(
          "Your account needs an email address or verified phone number.",
          422
        );
      }

      if (!fullName) {
        return jsonError(
          "Please update your name in your sign-in account and try again.",
          422
        );
      }

      const newCustomer = {
        firebase_uid: firebaseUid,
        full_name: fullName,
        email,
        phone_e164: phone,
        ...(email && decoded.email_verified
          ? { email_verified_at: new Date().toISOString() }
          : {}),
        ...(phone && decoded.phone_number
          ? { phone_verified_at: new Date().toISOString() }
          : {}),
      };

      const createResponse = await fetch(
        `${baseUrl}?on_conflict=firebase_uid&select=id,firebase_uid,full_name,email,phone_e164,email_verified_at,phone_verified_at,registration_completed_at,status`,
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
        console.error("Customer profile creation failed:", createResponse.status);
        return jsonError("Unable to create customer profile.", 502);
      }

      const created = (await createResponse.json()) as typeof customers;
      customer = created[0];

      // Another request may have created the same customer first.
      if (!customer) {
        const retryResponse = await fetch(
          `${baseUrl}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=id,firebase_uid,full_name,email,phone_e164,email_verified_at,phone_verified_at,registration_completed_at,status`,
          {
            method: "GET",
            headers,
            cache: "no-store",
          }
        );

        if (!retryResponse.ok) {
          return jsonError("Unable to load customer profile.", 502);
        }

        const retryCustomers =
          (await retryResponse.json()) as typeof customers;
        customer = retryCustomers[0];
      }
    }

    if (!customer) {
      return jsonError("Customer profile was not found.", 404);
    }

    if (customer.status !== "active") {
      return jsonError("This customer account is not active.", 403);
    }

    return NextResponse.json({ customer }, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "FirebaseAuthError" ||
        error.name === "TokenExpiredError" ||
        error.name === "JsonWebTokenError")
    ) {
      return jsonError("Your sign-in session is invalid or expired.", 401);
    }

    console.error("Customer profile API error:", error);
    return jsonError("An unexpected error occurred.", 500);
  }
}
