import "server-only";

// Best-effort sliding window, per server instance. The real limits are the
// 3-guess rule (enforced by a database constraint) and Supabase Auth's cap on
// anonymous sign-ins per IP; this only blunts bursts from one client. For a
// limit shared across instances, add a Vercel WAF rate-limit rule or Upstash.

export type Limit = { limit: number; windowMs: number };

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function isRateLimited(key: string, { limit, windowMs }: Limit, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const limited = recent.length >= limit;
  if (!limited) recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) {
      if (!times.length || now - times[times.length - 1] >= windowMs) hits.delete(k);
    }
  }
  return limited;
}
