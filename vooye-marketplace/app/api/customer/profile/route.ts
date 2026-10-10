import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail("Missing Firebase bearer token.", 401);

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(token);
    } catch {
      return fail("Invalid or expired sign-in token.", 401);
    }

    const uid = decoded.uid;
    const email = decoded.email?.trim().toLowerCase() ?? null;
    const phone = decoded.phone_number ?? null;
    const emailVerified = decoded.email_verified === true;
    // Firebase's phone_number claim is issued for a verified phone identity.
    const phoneVerified = Boolean(phone);

    const db = getSupabaseAdmin();

    const fields =
      "id, firebase_uid, full_name, email, phone_e164, email_verified_at, phone_verified_at, registration_completed_at, status";

    const { data: existing, error: lookupError } = await db
      .from("customers").select(fields).eq("firebase_uid", uid).maybeSingle();

    if (lookupError) {
      console.error("Customer lookup failed:", lookupError.code);
      return fail("Unable to load your profile. Please retry.", 500);
    }

    if (existing) {
      if (existing.status !== "active") return fail("Customer account is not active.", 403);

      // Fill missing identity data only. Do not silently overwrite profile data.
      const patch: Record<string, string> = {};
      if (!existing.email && email) patch.email = email;
      if (!existing.phone_e164 && phone) patch.phone_e164 = phone;
      if (!existing.email_verified_at && emailVerified) {
        patch.email_verified_at = new Date().toISOString();
      }
      if (!existing.phone_verified_at && phoneVerified) {
        patch.phone_verified_at = new Date().toISOString();
      }

      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await db.from("customers").update(patch)
          .eq("id", existing.id).eq("firebase_uid", uid);
        if (error?.code === "23505") {
          return fail("This contact is linked to another customer. Securely link the accounts or contact support.", 409);
        }
        if (error) {
          console.error("Customer update failed:", error.code);
          return fail("Unable to update your profile. Please retry.", 500);
        }
      }

      return NextResponse.json({
        customer: existing,
        isNewCustomer: false,
        registrationComplete: Boolean(existing.registration_completed_at),
      });
    }

    // A different Firebase UID with an already-used verified contact must not
    // create a duplicate. This is not an account-merging operation.
    if (email && emailVerified) {
      const { data, error } = await db.from("customers")
        .select("id").ilike("email", email).maybeSingle();
      if (error) {
        console.error("Email lookup failed:", error.code);
        return fail("Unable to verify your profile. Please retry.", 500);
      }
      if (data) {
        return fail("This email is already linked to a Vooye account. Sign in with that account or securely link sign-in methods.", 409);
      }
    }

    if (phone && phoneVerified) {
      const { data, error } = await db.from("customers")
        .select("id").eq("phone_e164", phone).maybeSingle();
      if (error) {
        console.error("Phone lookup failed:", error.code);
        return fail("Unable to verify your profile. Please retry.", 500);
      }
      if (data) {
        return fail("This phone number is already linked to a Vooye account. Sign in with that account or securely link sign-in methods.", 409);
      }
    }

    const { data: created, error: insertError } = await db.from("customers")
      .insert({
        firebase_uid: uid,
        email,
        phone_e164: phone,
        email_verified_at: emailVerified ? new Date().toISOString() : null,
        phone_verified_at: phoneVerified ? new Date().toISOString() : null,
      })
      .select(fields).single();

    if (insertError) {
      // If two requests arrive together, re-read by UID after a uniqueness race.
      if (insertError.code === "23505") {
        const { data: raced, error: rereadError } = await db.from("customers")
          .select(fields).eq("firebase_uid", uid).maybeSingle();
        if (!rereadError && raced) {
          return NextResponse.json({
            customer: raced,
            isNewCustomer: false,
            registrationComplete: Boolean(raced.registration_completed_at),
          });
        }
        return fail("This identity may already belong to another customer. Sign in with the original account or contact support.", 409);
      }
      console.error("Customer creation failed:", insertError.code);
      return fail("Unable to create your profile. Please retry.", 500);
    }

    return NextResponse.json({
      customer: created,
      isNewCustomer: true,
      registrationComplete: false,
    }, { status: 201 });
  } catch {
    console.error("Customer profile endpoint failed.");
    return fail("Unexpected error. Please retry.", 500);
  }
}
