import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/account";
  }
  return value;
}

function getPublicOrigin(request: NextRequest) {
  const configuredUrl = process.env.SITE_URL?.trim();
  if (configuredUrl) return new URL(configuredUrl).origin;
  if (process.env.NODE_ENV === "production") return "https://vooye.in";
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_not_configured", origin));
  }

  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(url, key, {
    cookieOptions: {
      ...(process.env.NODE_ENV === "production"
        ? { domain: ".vooye.in", secure: true }
        : {}),
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookiesToSet.push(...cookies);
      },
    },
  });

  try {
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("next", nextPath);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    if (error || !data.url) {
      console.error(
        "Google OAuth start failed:",
        JSON.stringify({
          message: error?.message ?? "Supabase did not return an OAuth URL",
          code: error && "code" in error ? error.code : undefined,
        })
      );
      return NextResponse.redirect(new URL("/sign-in?error=oauth_start_failed", origin));
    }

    const response = NextResponse.redirect(data.url);
    for (const cookie of cookiesToSet) {
      response.cookies.set(
        cookie.name,
        cookie.value,
        cookie.options as Parameters<typeof response.cookies.set>[2]
      );
    }
    return response;
  } catch (error: unknown) {
    console.error(
      "Google OAuth start failed:",
      JSON.stringify({
        message: error instanceof Error ? error.message : "Unknown OAuth start error",
      })
    );
    return NextResponse.redirect(new URL("/sign-in?error=oauth_start_failed", origin));
  }
}
