import { NextResponse, type NextRequest } from "next/server";
import { FIREBASE_SESSION_COOKIE, verifyFirebaseSessionCookie } from "@/lib/firebase/admin";

const PAGE_PREFIXES = ["/account", "/seller", "/admin"];
const API_PREFIXES = ["/api/customer", "/api/seller", "/api/admin"];

function startsWithRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

  // The API handlers enforce admin authorization from trusted Firebase UID allowlist
  // or persisted Prisma role. Middleware only protects the authenticated page session.

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/account/:path*", "/seller/:path*", "/admin/:path*", "/api/customer/:path*", "/api/seller/:path*", "/api/admin/:path*"],
};
