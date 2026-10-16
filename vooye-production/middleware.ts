import { NextResponse, type NextRequest } from "next/server";
import { FIREBASE_SESSION_COOKIE, verifyFirebaseSessionCookie } from "@/lib/firebase/admin";
import { isAdminUid } from "@/lib/admin-allowlist";

const PAGE_PREFIXES = ["/account", "/seller", "/admin"];
const API_PREFIXES = ["/api/customer", "/api/seller", "/api/admin"];

function startsWithRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
async function isSessionAdmin(request: NextRequest) {
  const cookie = request.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  try {
    const user = await verifyFirebaseSessionCookie(cookie);
    return isAdminUid(user.uid);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = startsWithRoute(pathname, PAGE_PREFIXES);
  const isProtectedApi = startsWithRoute(pathname, API_PREFIXES);
  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  // API route handlers must enforce authorization independently.
  if (isProtectedApi) return NextResponse.next();
  if (pathname === "/admin/login") return noStore(NextResponse.next());

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!(await isSessionAdmin(request))) {
      const destination = new URL("/admin/login", request.url);
      destination.searchParams.set("next", pathname + request.nextUrl.search);
      return noStore(NextResponse.redirect(destination));
    }
  } else {
    const cookie = request.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
    let authenticated = false;
    if (cookie) {
      try {
        await verifyFirebaseSessionCookie(cookie);
        authenticated = true;
      } catch {
        authenticated = false;
      }
    }
    if (!authenticated) {
      const destination = new URL("/sign-in", request.url);
      destination.searchParams.set("next", pathname + request.nextUrl.search);
      return noStore(NextResponse.redirect(destination));
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
