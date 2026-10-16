import { NextResponse, type NextRequest } from "next/server";
import { FIREBASE_SESSION_COOKIE, verifyFirebaseSessionCookie } from "@/lib/firebase/admin";

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

  // APIs authenticate Firebase ID tokens in their route handlers. The session
  // cookie is for browser page navigation only and is HttpOnly.
  if (isProtectedApi) return NextResponse.next();

  const sessionCookie = request.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  let user: Awaited<ReturnType<typeof verifyFirebaseSessionCookie>> | null = null;
  if (sessionCookie) {
    try {
      user = await verifyFirebaseSessionCookie(sessionCookie);
    } catch {
      user = null;
    }
  }

  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(signInUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    let isAdmin = isAdminAllowed(user.uid);
    if (!isAdmin) {
      // Preserve database role authorization using the Firebase UID. A server
      // API must still enforce admin access independently for every mutation.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        try {
          const query = new URL("/rest/v1/user_profiles", url);
          query.searchParams.set("select", "role");
          query.searchParams.set("user_id", `eq.${user.uid}`);
          const result = await fetch(query, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            cache: "no-store",
          });
          if (result.ok) {
            const profiles = (await result.json()) as Array<{ role?: string }>;
            isAdmin = profiles[0]?.role === "admin";
          }
        } catch {
          isAdmin = false;
        }
      }
    }
    if (!isAdmin) return NextResponse.redirect(new URL("/account?error=forbidden", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/account/:path*", "/seller/:path*", "/admin/:path*", "/api/customer/:path*", "/api/seller/:path*", "/api/admin/:path*"],
};
