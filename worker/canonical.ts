/** Formal cloud APIs are available only on the operator's configured origin. */
export function canonicalOrigin(request: URL, configured?: string): string {
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(request.hostname);
  if (!configured && local) return request.origin;
  if (!configured) throw new Error("CANONICAL_ORIGIN_REQUIRED");
  const canonical = new URL(configured);
  if (
    canonical.origin !== configured ||
    canonical.protocol !== "https:" ||
    canonical.username ||
    canonical.password ||
    canonical.search ||
    canonical.hash
  )
    throw new Error("INVALID_CANONICAL_ORIGIN");
  return canonical.origin;
}
