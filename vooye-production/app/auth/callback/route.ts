import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/account";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", request.url));
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
