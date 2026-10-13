// Best-effort per-isolate load shedding, not a global quota or DDoS guarantee.
// Platform requests still count. The database limiter remains authoritative.
const windows = new Map<string, { count: number; expires: number }>();
const maximumKeys = 4096;
export function burstAllowed(key: string, limit: number, now = Date.now()) {
  const prior = windows.get(key);
  if (prior && now < prior.expires) {
    if (prior.count >= limit) return false;
    prior.count++;
    return true;
  }
  if (windows.size >= maximumKeys) {
    for (const [k, v] of windows) if (v.expires <= now) windows.delete(k);
    // Bound memory even when an attacker rotates addresses. Never block the campus
    // network because unrelated keys filled this optional cache.
    if (windows.size >= maximumKeys)
      windows.delete(windows.keys().next().value!);
  }
  windows.set(key, { count: 1, expires: now + 60000 });
  return true;
}
