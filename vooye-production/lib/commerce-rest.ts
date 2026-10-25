import "server-only";
import { supabaseRest } from "@/lib/seller-server";

type SupabaseErrorBody = { message?: string; details?: string; hint?: string; code?: string };

async function responseError(response: Response): Promise<Error> {
  let message = "Supabase commerce request failed.";
  try {
    const body = await response.json() as SupabaseErrorBody;
    if (body.code === "P0001") message = "INSUFFICIENT_STOCK";
    else if (body.message && /^[A-Z_]+$/.test(body.message)) message = body.message;
  } catch {}
  return new Error(message);
}

export async function commerceRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const config = supabaseRest(`rpc/${name}`);
  const response = await fetch(config.url, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw await responseError(response);
  return await response.json() as T;
}

export async function commerceRows<T>(path: string): Promise<T[]> {
  const config = supabaseRest(path);
  const response = await fetch(config.url, {
    method: "GET",
    headers: config.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw await responseError(response);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Unexpected Supabase commerce response.");
  return data as T[];
}

export async function commercePatch(path: string, body: Record<string, unknown>): Promise<void> {
  const config = supabaseRest(path);
  const response = await fetch(config.url, {
    method: "PATCH",
    headers: { ...config.headers, Prefer: "return=minimal" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw await responseError(response);
}
