import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getAuthCookieOptions() {
  return {
    // Share auth cookies across vooye.in subdomains in production.
    ...(process.env.NODE_ENV === "production"
      ? { domain: ".vooye.in", secure: true }
      : {}),
    sameSite: "lax" as const,
    path: "/",
  };
}

/** Server Component / Route Handler client with cookie-backed Auth sessions. */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase Auth is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      },
    },
  });
}
