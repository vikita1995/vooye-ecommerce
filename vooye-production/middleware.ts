import { NextResponse, type NextRequest } from "next/server";
import { FIREBASE_SESSION_COOKIE, verifyFirebaseSessionCookie } from "@/lib/firebase/admin";
import { isAdminUid } from "@/lib/auth";

const PAGE_PREFIXES = ["/account", "/seller", "/admin"];
const API_PREFIXES = ["/api/customer", "/api/seller", "/api/admin"];

function startsWithRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = startsWithRoute(pathname, PAGE_PREFIXES);
  const isProtectedApi = startsWithRoute(pathname, API_PREFIXES);
  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  // API handlers must perform their own authorization; middleware is defense in depth.
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

  if (pathname === "/admin/login") {
    // The dedicated login page handles existing sessions and performs the server check.
    return noStore(NextResponse.next());
  }

  if (!user) {
    const destination = pathname === "/admin" || pathname.startsWith("/admin/") ? "/admin/login" : "/sign-in";
    const signInUrl = new URL(destination, request.url);
    signInUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return noStore(NextResponse.redirect(signInUrl));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!isAdminUid(user.uid)) {
      return noStore(NextResponse.redirect(new URL("/admin/login?error=not_admin", request.url)));
    }
  }

  return noStore(NextResponse.next());
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/account/:path*",
    "/seller/:path*",
    "/admin/:path*",
    "/api/customer/:path*",
    "/api/seller/:path*",
    "/api/admin/:path*",
  ],
};
