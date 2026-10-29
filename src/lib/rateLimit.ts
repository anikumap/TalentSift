/**
 * In-memory fixed-window limiter. Fine for the single-instance SQLite deployment;
 * move to a shared store (Redis, the database) before running more than one server.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

/** Records one attempt for `key`; returns false once `limit` attempts happen within `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function clear(key: string): void {
  hits.delete(key);
}

/**
 * Best-effort client IP from the reverse proxy's headers (deploy behind one that overwrites them).
 * A spoofed value only lets a client dodge its own limit, never use up someone else's.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
