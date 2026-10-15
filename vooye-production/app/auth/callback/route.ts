import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/account";
  }

  return value;
}

function getPublicOrigin(request: NextRequest) {
  const configuredUrl = process.env.SITE_URL?.trim();

  if (configuredUrl) {
    return new URL(configuredUrl).origin;
  }

  if (process.env.NODE_ENV === "production") {
    return "https://vooye.in";
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_auth_code", origin)
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Supabase auth callback failed:", error.message);

      return NextResponse.redirect(
        new URL("/sign-in?error=auth_callback_failed", origin)
      );
    }

    return NextResponse.redirect(new URL(nextPath, origin));
  } catch (error) {
    console.error("Unexpected auth callback error:", error);

    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin)
    );
  }
}