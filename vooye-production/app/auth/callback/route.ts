import { NextResponse, type NextRequest } from "next/server";

// Supabase OAuth callback is no longer used. Never exchange an old auth code
// for a second provider session or reflect it into a redirect.
export async function GET(request: NextRequest) {
  const origin = process.env.NODE_ENV === "production"
    ? "https://vooye.in"
    : request.nextUrl.origin;
  const nextValue = request.nextUrl.searchParams.get("next");
  const nextPath = nextValue && nextValue.startsWith("/") && !nextValue.startsWith("//") && !nextValue.includes("\\")
    ? nextValue
    : "/account";
  const destination = new URL("/sign-in", origin);
  destination.searchParams.set("next", nextPath);
  destination.searchParams.set("error", "legacy_supabase_auth_disabled");
  return NextResponse.redirect(destination);
}
