import { NextResponse, type NextRequest } from "next/server";

// Supabase OAuth was retired when Firebase Authentication became the
// single identity provider. Keep the legacy URL safe for old bookmarks.
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
