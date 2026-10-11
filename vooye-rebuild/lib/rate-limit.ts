// Small best-effort in-process limit. Use a shared store (e.g. Redis/Upstash) for multi-instance production.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now(); const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count:1, resetAt:now+windowMs }); return { ok:true, retryAfter:0 }; }
  if (current.count >= limit) return { ok:false, retryAfter:Math.ceil((current.resetAt-now)/1000) };
  current.count += 1; return { ok:true, retryAfter:0 };
}
