import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("Supabase auth callback failed: server auth configuration is missing");
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin)
    );
  }

  // Use the incoming request's cookies explicitly for the PKCE verifier lookup.
  // Buffer auth cookie writes and attach them to the final redirect response.
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(url, key, {
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    const redirectUrl = error
      ? new URL("/sign-in?error=auth_callback_failed", origin)
      : new URL(nextPath, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Preserve session cookies produced by exchangeCodeForSession on redirect.
    for (const cookie of cookiesToSet) {
      response.cookies.set(
        cookie.name,
        cookie.value,
        cookie.options as Parameters<typeof response.cookies.set>[2]
      );
    }

    if (error) {
      // Log cookie names only; never log cookie values, authorization codes, or tokens.
      const requestCookieNames = request.cookies.getAll().map(({ name }) => name);
      console.error("Supabase auth callback failed:", {
        message: error.message,
        hasCodeVerifierCookie: requestCookieNames.some((name) =>
          name.includes("code-verifier")
        ),
        hasFlowVerifierCookie: requestCookieNames.some((name) =>
          name.includes("flow-") && name.includes("code-verifier")
        ),
      });
    }

    return response;
  } catch (error) {
    console.error(
      "Unexpected auth callback error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin)
    );
  }
}
