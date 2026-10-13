// Network policy checks; synthetic responses only, never connects to production.
import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({
  entryPoints: ["src/api.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const { api } = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
const originalFetch = globalThis.fetch,
  originalTimer = globalThis.setTimeout;
const checks = [];
let calls;
const use = (fn) => {
  calls = 0;
  globalThis.fetch = async (...args) => {
    calls++;
    return fn(...args);
  };
};
try {
  use(() => {
    if (calls === 1) throw Error("lost connection");
    return Response.json({ ok: true });
  });
  assert.equal((await api("/sessions")).ok, true);
  assert.equal(calls, 2);
  checks.push("One transient read failure recovers with exactly one retry");
  for (const status of [401, 403, 404, 429]) {
    use(() => new Response("<html>gateway</html>", { status }));
    await assert.rejects(api("/admin/state"), (e) => e.status === status);
    assert.equal(calls, 1);
  }
  checks.push(
    "Permission denials and rate limits never retry, including HTML responses",
  );
  use(() => new Response("unreadable", { status: 503 }));
  await assert.rejects(api("/sessions"), (e) => e.code === "NETWORK");
  assert.equal(calls, 2);
  use(() => Response.json(null));
  await assert.rejects(api("/sessions"));
  assert.equal(calls, 2);
  checks.push(
    "Unreadable gateway/null responses fail safely after at most two reads",
  );
  for (const path of [
    "/register",
    "/admin/login",
    "/admin/registrations",
    "/cancel",
  ]) {
    use(() => {
      throw Error("lost result");
    });
    await assert.rejects(
      api(path, { test: true }),
      (e) =>
        e.code === "NETWORK" &&
        (path === "/register" || !e.message.includes("我的报名")),
    );
    assert.equal(calls, 1);
  }
  checks.push(
    "Writes/login never replay and staff errors do not direct users to My registrations",
  );
  globalThis.setTimeout = (fn, ms, ...args) =>
    originalTimer(fn, ms === 20000 ? 25 : ms, ...args);
  use(
    (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("timeout"))),
      ),
  );
  await assert.rejects(api("/sessions"), (e) => e.code === "NETWORK");
  assert.equal(calls, 1);
  use((url, { signal }) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve, reject) =>
          signal.addEventListener("abort", () => reject(Error("body timeout"))),
        ),
    }),
  );
  await assert.rejects(api("/sessions"), (e) => e.code === "NETWORK");
  assert.equal(calls, 1);
  checks.push(
    "Timeout covers both connection and body and does not start another attempt",
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimer;
}
