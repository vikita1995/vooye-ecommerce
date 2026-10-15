export type VerifiedSupabaseUser = {
  uid: string;
  email?: string;
  name?: string;
  phone_number?: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_CONFIG_MISSING");
  return { url, key };
}

/** Validate every bearer token with Supabase Auth; never trust decoded JWT claims alone. */
export async function verifySupabaseAccessToken(token: string): Promise<VerifiedSupabaseUser> {
  if (!token || token.length > 16_384) throw new Error("AUTH_INVALID");
  const { url, key } = config();

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("AUTH_SERVICE_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("AUTH_INVALID");
  }
  if (!response.ok) throw new Error("AUTH_SERVICE_UNAVAILABLE");

  const user = (await response.json()) as SupabaseAuthUser;
  if (!user.id) throw new Error("AUTH_INVALID");

  const fullName = user.user_metadata?.full_name;
  return {
    uid: user.id,
    email: user.email ?? undefined,
    name: typeof fullName === "string" ? fullName : undefined,
    phone_number: user.phone ?? undefined,
  };
}

/** Pull a bearer token from API requests. */
export async function authenticateSupabaseRequest(request: Request): Promise<VerifiedSupabaseUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  return verifySupabaseAccessToken(token);
}
