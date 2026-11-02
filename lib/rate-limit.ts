// A small per-visitor limit for routes that spend units, write to the graph or run the full engine.
// It lives in memory, so each server instance counts alone, which is enough to stop a burst.

const MAX_VISITORS = 5000;
const visits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (visits.get(key) ?? []).filter((time) => now - time < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  // Re-adding keeps the Map in order of last use, so the oldest visitor is dropped first.
  visits.delete(key);
  visits.set(key, recent);
  if (visits.size > MAX_VISITORS) visits.delete(visits.keys().next().value!);
  return allowed;
}

export const visitorOf = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
