import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PAGE_PREFIXES = ["/account", "/seller", "/admin"];
const API_PREFIXES = ["/api/customer", "/api/seller", "/api/admin"];

function startsWithRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAdminAllowed(uid: string) {
  return (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(uid);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = startsWithRoute(pathname, PAGE_PREFIXES);
  const isProtectedApi = startsWithRoute(pathname, API_PREFIXES);

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return isProtectedApi
      ? NextResponse.json({ error: "Authentication service is not configured." }, { status: 503 })
      : NextResponse.redirect(new URL("/sign-in?error=auth_not_configured", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        if (headers) {
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  if (error || !user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/") ||
      pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
    let isAdmin = isAdminAllowed(user.id);
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      isAdmin = profile?.role === "admin";
    }

    if (!isAdmin) {
      return isProtectedApi
        ? NextResponse.json({ error: "Administrator access required." }, { status: 403 })
        : NextResponse.redirect(new URL("/account?error=forbidden", request.url));
    }
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/seller/:path*",
    "/admin/:path*",
    "/api/customer/:path*",
    "/api/seller/:path*",
    "/api/admin/:path*",
  ],
};
