// Offline adversarial checks with fictional data and an in-memory SQLite adapter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
async function load(path) {
  const r = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(r.outputFiles[0].text).toString("base64")
  );
}
const { default: worker } = await load("worker/index.ts"),
  core = await load("worker/core.ts");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("schema/v2.sql", "utf8"));
const events = [];
function statement(sql, params = []) {
  const invoke = (method) => {
    const s = sqlite.prepare(sql),
      before = sqlite.prepare("SELECT total_changes() AS n").get().n;
    const value = s[method](...params);
    const changes =
      sqlite.prepare("SELECT total_changes() AS n").get().n - before;
    events.push({ sql, writes: changes });
    return { value, changes };
  };
  return {
    bind: (...args) => statement(sql, args),
    first: async () => invoke("get").value || null,
    all: async () => ({ results: invoke("all").value }),
    run: async () => {
      const r = invoke("run");
      return { results: [], meta: { changes: r.value.changes } };
    },
  };
}
const env = {
  DB: {
    prepare: statement,
    batch: async (ss) => {
      sqlite.exec("BEGIN");
      try {
        const r = [];
        for (const s of ss) r.push(await s.run());
        sqlite.exec("COMMIT");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  },
  APP_MODE: "preview",
  DATA_SPACE: "security-local",
  APP_SECRET: randomUUID(),
  ADMIN_PASSWORD: randomUUID(),
  ASSETS: { fetch: async () => new Response("static") },
};
sqlite.exec("INSERT INTO rounds(id,title,sort_order) VALUES('r','TEST',1)");
const now = Math.floor(Date.now() / 1000),
  sid = "security-session";
sqlite
  .prepare(
    "INSERT INTO sessions(id,round_id,template_key,title,subjects,agenda,venue,start_at,end_at,deadline_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  )
  .run(
    sid,
    "r",
    "test",
    "TEST session",
    "[]",
    "[]",
    "TEST room",
    now + 86400,
    now + 90000,
    now + 3600,
    "published",
  );
async function request(
  path,
  data,
  method = data ? "POST" : "GET",
  headers = {},
) {
  return worker.fetch(
    new Request("https://example.test/api" + path, {
      method,
      headers: {
        "CF-Connecting-IP": "192.0.2.1",
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    env,
  );
}
const payload = (id) => ({
  sessionId: sid,
  name: "TEST Person",
  department: "TEST Unit",
  employeeId: "TEST-" + id,
  email: "test@example.invalid",
  receipt: "mr_" + core.randomToken(),
  requestId: randomUUID(),
  contentRevision: 1,
  consent: true,
});
const pass = [];
for (const path of [
  "/admin/state",
  "/admin/registrations",
  "/admin/export-data",
  "/admin/recipients?session=" + sid,
  "/admin/backup",
  "/admin/audit",
])
  assert.equal((await request(path)).status, 401);
pass.push("All staff read/export/backup routes reject anonymous access");
const invalidBefore = events.length;
assert.equal((await request("/register", {})).status, 400);
assert.equal(events.length, invalidBefore);
assert.equal(
  (
    await request("/register", payload("cross"), "POST", {
      Origin: "https://attacker.invalid",
    })
  ).status,
  403,
);
assert.equal(events.length, invalidBefore);
pass.push(
  "Invalid registration and cross-origin request rejected before database access",
);
const a = payload("A"),
  b = payload("B");
const ar = await request("/register", a);
assert.equal(ar.status, 201);
const aid = (await ar.json()).id;
const br = await request("/register", b);
assert.equal(br.status, 201);
const bid = (await br.json()).id;
const replay = await request("/register", a);
assert.equal(replay.status, 200);
assert.equal((await replay.json()).id, aid);
assert.equal(
  sqlite.prepare("SELECT booked_count AS n FROM sessions WHERE id=?").get(sid)
    .n,
  2,
);
const mine = await (await request("/mine", { receipts: [a.receipt] })).json();
assert.equal(mine.registrations.length, 1);
assert.equal(mine.registrations[0].id, aid);
assert.ok(!JSON.stringify(mine).includes(b.employeeId));
assert.ok(!JSON.stringify(mine).includes("receipt_hash"));
assert.deepEqual(
  await (
    await request("/mine", { receipts: ["mr_" + core.randomToken()] })
  ).json(),
  { registrations: [] },
);
for (const [path, method, extra] of [
  ["/cancel", "POST", {}],
  [
    "/registration-email",
    "PATCH",
    { email: "other@example.invalid", version: 1 },
  ],
  ["/confirm-change", "POST", { contentRevision: 1 }],
])
  assert.equal(
    (await request(path, { id: bid, receipt: a.receipt, ...extra }, method))
      .status,
    404,
  );
pass.push(
  "Private receipts isolate lookup, cancellation, email edits and change confirmation; retry does not duplicate booking",
);
const duplicate = await request("/register", {
  ...payload("A"),
  name: "Another TEST",
});
assert.equal(duplicate.status, 409);
assert.equal((await duplicate.json()).code, "DUPLICATE_REGISTRATION");
pass.push(
  "Duplicate disclosure limited to booking existence; known employee IDs remain enumerable under self-declared identity",
);
for (let i = 0; i < 4; i++) await core.throttle(env, "test-quota", 4);
const writeBefore = sqlite.prepare("SELECT total_changes() AS n").get().n;
for (let i = 0; i < 12; i++)
  await assert.rejects(
    core.throttle(env, "test-quota", 4),
    (e) => e.status === 429,
  );
assert.equal(
  sqlite.prepare("SELECT total_changes() AS n").get().n,
  writeBefore,
);
pass.push("Rejected quota attempts perform zero further database writes");
for (let i = 0; i < 30; i++)
  assert.equal(
    (
      await request("/admin/login", { password: "wrong" }, "POST", {
        "CF-Connecting-IP": "192.0.2.2",
      })
    ).status,
    401,
  );
const beforeBurst = events.length,
  blocked = await request("/admin/login", { password: "wrong" }, "POST", {
    "CF-Connecting-IP": "192.0.2.2",
  });
assert.equal(blocked.status, 429);
assert.equal(blocked.headers.get("Retry-After"), "60");
assert.equal(events.length, beforeBurst);
pass.push(
  "Repeated login attempts stop before database access within a warm instance",
);
const login = await request(
  "/admin/login",
  { password: env.ADMIN_PASSWORD },
  "POST",
  { "CF-Connecting-IP": "192.0.2.3" },
);
assert.equal(login.status, 200);
const cookie = login.headers.get("Set-Cookie");
for (const flag of ["HttpOnly", "Secure", "SameSite=Strict"])
  assert.ok(cookie.includes(flag));
assert.equal(
  (await request("/admin/state", undefined, "GET", { Cookie: cookie })).status,
  200,
);
assert.equal(
  (await request("/admin/logout", {}, "POST", { Cookie: cookie })).status,
  200,
);
assert.equal(
  (await request("/admin/state", undefined, "GET", { Cookie: cookie })).status,
  401,
);
pass.push("Staff login/logout, expiry lookup and secure cookie flags retained");
const pub = await request("/sessions");
assert.equal(pub.headers.get("Cache-Control"), "no-store");
assert.equal(pub.headers.get("X-Frame-Options"), "DENY");
assert.ok(!JSON.stringify(await pub.json()).includes(a.email));
pass.push(
  "Public session data excludes participant fields and disables caching/framing",
);
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
};
const api = await load("src/api.ts");
const pending = {
  receipt: a.receipt,
  requestId: a.requestId,
  sessionId: sid,
  title: "TEST",
  payload: a,
};
api.saveAttempt("test", pending);
assert.ok(api.attempts("test")[0].payload);
api.saveAttempt("test", { ...pending, id: aid });
assert.equal(api.attempts("test")[0].payload, undefined);
storage.set(
  "mentor-v2:legacy:receipts",
  JSON.stringify([{ ...pending, id: aid }]),
);
assert.equal(api.attempts("legacy")[0].payload, undefined);
assert.ok(!storage.get("mentor-v2:legacy:receipts").includes(a.email));
pass.push(
  "Confirmed and legacy browser payloads removed while pending retry data and receipts survive",
);
console.log(JSON.stringify({ passed: true, checks: pass }, null, 2));
sqlite.close();
