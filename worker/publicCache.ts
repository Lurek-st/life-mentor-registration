import type { Env, Row } from "./core";
import { settings } from "./core";
import { requireCurrentSchema } from "./schemaHealth";

// Only public source rows are cached. Status/deadline and server time are rebuilt
// on every response. Binding identity isolates production, preview and tests.
type Entry<T> = { expires: number; promise: Promise<T> };
type PublicData = { rows: Row[]; rounds: Row[]; config: Row };
const sessions = new WeakMap<Env["DB"], Entry<PublicData>>();
const health = new WeakMap<
  Env["DB"],
  Entry<{ version: unknown; config: Row }>
>();
function cached<T>(
  map: WeakMap<Env["DB"], Entry<T>>,
  e: Env,
  load: () => Promise<T>,
) {
  const prior = map.get(e.DB);
  if (prior && prior.expires > Date.now()) return prior.promise;
  const entry: Entry<T> = { expires: Date.now() + 2000, promise: load() };
  map.set(e.DB, entry);
  entry.promise.catch(() => {
    if (map.get(e.DB) === entry) map.delete(e.DB);
  });
  return entry.promise;
}
export const publicSessions = (e: Env) =>
  cached(sessions, e, async () => {
    const [rows, rounds, config] = await Promise.all([
      e.DB.prepare(
        "SELECT * FROM sessions WHERE state NOT IN ('draft','archived') ORDER BY start_at,sort_order,id",
      ).all(),
      e.DB.prepare("SELECT * FROM rounds ORDER BY sort_order,id").all(),
      settings(e),
    ]);
    return { rows: rows.results, rounds: rounds.results, config };
  });
export const publicHealth = (e: Env) =>
  cached(health, e, async () => {
    await requireCurrentSchema(e);
    const [v, config] = await Promise.all([
      e.DB.prepare("SELECT version FROM schema_meta").first(),
      settings(e),
    ]);
    return { version: v?.version, config };
  });
export function invalidatePublic(e: Env) {
  sessions.delete(e.DB);
  health.delete(e.DB);
}
