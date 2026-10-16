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

function getSafeAuthError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      status?: unknown;
    };

    return {
      name: typeof value.name === "string" ? value.name : undefined,
      message:
        typeof value.message === "string"
          ? value.message
          : "Unknown authentication error",
      code: typeof value.code === "string" ? value.code : undefined,
      status: typeof value.status === "number" ? value.status : undefined,
    };
  }

  return {
    message:
      typeof error === "string" ? error : "Unknown authentication error",
  };
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
    console.error(
      "Supabase auth callback failed:",
      JSON.stringify({ message: "Supabase server auth configuration is missing" })
    );
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin)
    );
  }

  // Read the verifier from the cookies sent to this callback request.
  // Buffer cookie updates so the resulting session cookies can be attached
  // to the redirect response returned by this Route Handler.
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const requestCookieNames = request.cookies.getAll().map(({ name }) => name);
  const hasCodeVerifierCookie = requestCookieNames.some((name) =>
    name.includes("code-verifier")
  );
  const hasFlowVerifierCookie = requestCookieNames.some(
    (name) => name.includes("flow-") && name.includes("code-verifier")
  );

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

    for (const cookie of cookiesToSet) {
      response.cookies.set(
        cookie.name,
        cookie.value,
        cookie.options as Parameters<typeof response.cookies.set>[2]
      );
    }

    if (error) {
      // Log safe error metadata and cookie presence only. Never log auth codes,
      // cookie values, access tokens, or refresh tokens.
      console.error(
        "Supabase auth callback failed:",
        JSON.stringify({
          ...getSafeAuthError(error),
          hasCodeVerifierCookie,
          hasFlowVerifierCookie,
          requestHost: request.nextUrl.host,
          cookieCount: requestCookieNames.length,
        })
      );
    }

    return response;
  } catch (error: unknown) {
    console.error(
      "Unexpected auth callback error:",
      JSON.stringify({
        ...getSafeAuthError(error),
        hasCodeVerifierCookie,
        hasFlowVerifierCookie,
        requestHost: request.nextUrl.host,
        cookieCount: requestCookieNames.length,
      })
    );

    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin)
    );
  }
}
