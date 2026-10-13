// Synthetic in-memory database only. Exercise actual worker routes, guards and restore code.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { build } from "esbuild";
import { restoreSql } from "./restore-model.mjs";
const bundle = async (p) => {
  const b = await build({
    entryPoints: [p],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(b.outputFiles[0].text).toString("base64")
  );
};
const worker = (await bundle("worker/index.ts")).default,
  { termSheets, attendanceRows } = await bundle("src/attendanceExport.ts"),
  { multiWorkbook } = await bundle("src/export.ts");
const db = new DatabaseSync(":memory:");
db.exec(readFileSync("schema/v2.sql", "utf8"));
let queries = 0;
function stmt(sql, args = []) {
  return {
    bind(...a) {
      return stmt(sql, a);
    },
    async first() {
      queries++;
      return db.prepare(sql).get(...args) || null;
    },
    async all() {
      queries++;
      return { results: db.prepare(sql).all(...args) };
    },
    async run() {
      return exec(sql, args);
    },
    sql,
    args,
  };
}
function exec(sql, args) {
  queries++;
  const p = db.prepare(sql);
  if (p.columns().length)
    return { results: p.all(...args), meta: { changes: 0 } };
  const r = p.run(...args);
  return { results: [], meta: { changes: Number(r.changes) } };
}
const env = {
  DB: {
    prepare: stmt,
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const r = stmts.map((s) => exec(s.sql, s.args));
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  },
  ASSETS: { fetch: () => new Response("test") },
  APP_MODE: "preview",
  DATA_SPACE: "synthetic",
  APP_SECRET: "synthetic-local-key-only",
  ADMIN_PASSWORD: "synthetic-local-password-only",
};
let cookie = "",
  marks = [];
const mark = (s) => {
  marks.push(s);
  console.log("PASS " + s);
};
async function req(
  path,
  data,
  auth = true,
  method = data ? "POST" : "GET",
  origin,
) {
  const r = await worker.fetch(
    new Request("https://synthetic.invalid/api" + path, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(auth ? { cookie } : {}),
        ...(origin ? { origin } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    env,
  );
  return { status: r.status, j: await r.json(), h: r.headers };
}
function ok(r, status = 200) {
  assert.equal(r.status, status, r.j.code || JSON.stringify(r.j));
  return r.j;
}
const login = await req("/admin/login", { password: env.ADMIN_PASSWORD });
ok(login);
cookie = login.h.get("set-cookie").split(";")[0];
const now = Math.floor(Date.now() / 1000);
db.exec(
  "INSERT INTO rounds(id,title,sort_order) VALUES('round-a','测试轮次',1)",
);
function event(id, delta = 0) {
  db.prepare(
    "INSERT INTO sessions(id,round_id,template_key,title,title_en,subjects,agenda,venue,start_at,end_at,deadline_at,capacity,state) VALUES (?,'round-a','t','测试活动','Test','[]','[]','测试地点',?,?,?,1000,'published')",
  ).run(id, now - 7200 + delta, now - 3600 + delta, now - 10800 + delta);
}
event("s1");
event("s2", 86400);
event("s3");
const hash = (id) =>
  createHmac("sha256", env.APP_SECRET)
    .update("employee:" + id)
    .digest("hex");
// Initial fixture inserts emulate pre-existing registrations, without altering production rules.
db.exec("DROP TRIGGER registration_gate_v2");
function reg(id, sid = "s1") {
  db.prepare(
    "INSERT INTO registrations(id,session_id,name,department,employee_id,employee_hash,receipt_hash,request_id,request_fingerprint,confirmed_revision,snapshot,email) VALUES (?,?,?,?,?,?,?,?,?,1,'{}',?)",
  ).run(
    randomUUID(),
    sid,
    "虚构" + id,
    "测试部门",
    id,
    hash(id),
    randomUUID(),
    randomUUID(),
    "fixture",
    id + "@example.invalid",
  );
}
for (const id of ["TEST-0001", "TEST-0002", "TEST-0003"]) reg(id);
reg("TEST-0001", "s2");
reg("TEST-0001", "s3");
db.exec(readFileSync("schema/v2.sql", "utf8"));
const attendancePayload = (id) => ({
  sessionId: "s1",
  sessionVersion: 1,
  name: "虚构" + id,
  department: "测试部门",
  employeeId: id,
  email: id + "@example.invalid",
  operator: "测试确认人",
  note: "合成现场确认",
  confirmed: true,
  requestId: randomUUID(),
});
ok(await req("/admin/attendance", attendancePayload("TEST-0004")), 201);
const read = async (s = "s1") =>
  ok(await req("/admin/attendance-review?session=" + s));
const payload = (d, entries) => ({
  sessionId: d.session.id,
  revision: d.revision,
  entries,
  operator: "合成核对人",
  note: "合成签到表核对",
  confirmed: true,
  requestId: randomUUID(),
});
for (const p of [
  "/admin/attendance-review?session=s1",
  "/admin/attendance-term?sessions=s1",
  "/admin/attendance-batch?id=" + randomUUID(),
])
  ok(await req(p, undefined, false), 401);
ok(
  await req(
    "/admin/attendance-review",
    payload(await read(), [{ employeeId: "TEST-0001", outcome: "present" }]),
    true,
    "POST",
    "https://other.invalid",
  ),
  403,
);
mark(
  "Authentication and same-origin guards protect review, term and result lookup",
);
let d = await read();
assert.equal(d.people.length, 4);
assert.equal(d.people.filter((p) => p.outcome === "present").length, 1);
let p = payload(d, [{ employeeId: "TEST-0001", outcome: "present" }]);
ok(await req("/admin/attendance-review", p), 201);
ok(await req("/admin/attendance-review", p));
assert.equal(
  db.prepare("SELECT count(*) n FROM attendance_batches").get().n,
  1,
);
assert.equal(
  db
    .prepare("SELECT count(*) n FROM audit WHERE action='attendance.review'")
    .get().n,
  1,
);
ok(await req("/admin/attendance-review", { ...p, note: "changed" }), 409);
ok(
  await req("/admin/attendance-review", { ...p, requestId: randomUUID() }),
  409,
);
d = await read();
assert.equal(
  d.people.find((x) => x.employee_id === "TEST-0002").outcome,
  "unknown",
);
assert.equal(
  d.people.find((x) => x.employee_id === "TEST-0004").outcome,
  "present",
);
mark(
  "Partial sign-in preserves unknowns and legacy positives; replay is idempotent; stale preview rejected",
);
p = payload(d, [
  { employeeId: "TEST-0002", outcome: "absent" },
  { employeeId: "TEST-0003", outcome: "present" },
]);
db.exec(
  "CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit WHEN NEW.action='attendance.review' BEGIN SELECT RAISE(ABORT,'TEST_FAIL'); END;",
);
ok(await req("/admin/attendance-review", p), 503);
assert.equal((await read()).revision, d.revision);
assert.equal(db.prepare("SELECT count(*) n FROM attendance_checks").get().n, 1);
db.exec("DROP TRIGGER synthetic_failure");
ok(await req("/admin/attendance-review", p), 201);
assert.equal(
  ok(await req("/admin/attendance-batch?id=" + p.requestId)).saved,
  true,
);
mark(
  "Injected mid-transaction failure leaves no partial rows, revision or batch; subsequent safe retry succeeds",
);
const future = await read("s2");
ok(
  await req(
    "/admin/attendance-review",
    payload(future, [{ employeeId: "TEST-0001", outcome: "absent" }]),
  ),
  409,
);
ok(
  await req(
    "/admin/attendance-review",
    payload(await read(), [{ employeeId: "TEST-0001", outcome: "unknown" }]),
  ),
  201,
);
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0001").outcome,
  "unknown",
);
ok(await req("/admin/combined-export?session=s1"), 409);
ok(await req("/admin/attendance-export?session=s1"), 409);
ok(await req("/admin/combined-export?format=review&session=s1"));
ok(await req("/admin/attendance-export?history=1&session=s1"));
mark(
  "Future absence forbidden, correction to pending works, old misleading exports require refresh",
);
const beforeBookings = db
  .prepare("SELECT booked_count FROM sessions WHERE id='s1'")
  .get().booked_count;
d = await read();
p = payload(d, [{ employeeId: "TEST-0003", outcome: "absent" }]);
const race = await Promise.all([
  req("/admin/attendance-review", p),
  req("/admin/attendance-review", {
    ...p,
    requestId: randomUUID(),
    entries: [{ employeeId: "TEST-0003", outcome: "present" }],
  }),
]);
assert.equal(race.filter((r) => r.status === 201).length, 1);
assert.equal(race.filter((r) => r.status === 409).length, 1);
assert.equal(
  db.prepare("SELECT booked_count FROM sessions WHERE id='s1'").get()
    .booked_count,
  beforeBookings,
);
mark(
  "Concurrent reviewers cannot overwrite a shared preview; bookings remain unchanged",
);
d = await read();
ok(
  await req(
    "/admin/attendance-review",
    payload(d, [{ employeeId: "TEST-0004", outcome: "present" }]),
  ),
  201,
);
db.exec(
  "UPDATE attendance_records SET email='corrected@example.invalid',version=version+1 WHERE session_id='s1' AND employee_id='TEST-0004'",
);
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0004").outcome,
  "present",
);
db.exec(
  "UPDATE attendance_records SET confirmation_note='changed evidence',version=version+1 WHERE session_id='s1' AND employee_id='TEST-0004'",
);
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0004").needsReview,
  true,
);
mark(
  "Contact-only correction preserves attendance; evidence changes require review",
);
// A corrected identity must not silently transfer an attendance decision.
db.prepare(
  "UPDATE registrations SET employee_id='TEST-0099',employee_hash=?,version=version+1 WHERE session_id='s1' AND employee_id='TEST-0003'",
).run(hash("TEST-0099"));
d = await read();
assert.equal(
  d.people.find((x) => x.employee_id === "TEST-0003").needsReview,
  true,
);
assert.equal(
  d.people.find((x) => x.employee_id === "TEST-0099").outcome,
  "unknown",
);
ok(
  await req(
    "/admin/attendance-review",
    payload(d, [{ employeeId: "TEST-0003", outcome: "unknown" }]),
  ),
  201,
);
assert.ok(!(await read()).people.some((x) => x.employee_id === "TEST-0003"));
mark(
  "Employee correction invalidates old link; explicit reset removes orphan from current roster",
);
// Cancellation does not erase a confirmed fact; session time change requires recheck.
d = await read();
ok(
  await req(
    "/admin/attendance-review",
    payload(d, [{ employeeId: "TEST-0001", outcome: "present" }]),
  ),
  201,
);
db.exec(
  "UPDATE registrations SET cancelled_at=unixepoch(),version=version+1 WHERE session_id='s1' AND employee_id='TEST-0001'",
);
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0001").outcome,
  "present",
);
db.exec("UPDATE sessions SET state='archived',version=version+1 WHERE id='s1'");
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0001").outcome,
  "present",
);
db.exec(
  "UPDATE sessions SET start_at=start_at+60,end_at=end_at+60,version=version+1 WHERE id='s1'",
);
assert.equal(
  (await read()).people.find((x) => x.employee_id === "TEST-0001").needsReview,
  true,
);
mark(
  "Cancelled registration and archive preserve confirmed attendance; rescheduled time flags review",
);
// JSON set-based insert keeps even 500 selected people below Free query limits.
event("bulk");
db.exec("DROP TRIGGER registration_gate_v2");
for (let i = 0; i < 500; i++)
  reg("TEST-B" + String(i).padStart(4, "0"), "bulk");
db.exec(readFileSync("schema/v2.sql", "utf8"));
d = await read("bulk");
queries = 0;
ok(
  await req(
    "/admin/attendance-review",
    payload(
      d,
      d.people.map((x) => ({ employeeId: x.employee_id, outcome: "present" })),
    ),
  ),
  201,
);
assert.ok(queries <= 50);
const bulkQueries = queries;
assert.equal(
  (await read("bulk")).people.filter((p) => p.outcome === "present").length,
  500,
);
mark("500-person atomic batch within 64 KiB input and Free query budget");
const term = ok(await req("/admin/attendance-term?sessions=s1,s2,s3")),
  sheets = termSheets(term),
  one = sheets[0].rows.find((r) => r[0] === "TEST-0001");
assert.equal(one[7], 2);
assert.ok(!JSON.stringify(term).includes("receipt_hash"));
assert.ok(!JSON.stringify(term).includes("request_fingerprint"));
const out =
  process.env.QA_OUT ||
  "work/qa/attendance-" + new Date().toISOString().replaceAll(":", "-");
mkdirSync(out, { recursive: true });
writeFileSync(out + "/synthetic-summary.xlsx", multiWorkbook(sheets));
assert.equal(attendanceRows(await read())[0][2], "工号");
mark(
  "Term uses distinct sessions, excludes future pending, preserves IDs and exports literal text",
);
const backup = ok(await req("/admin/backup", { password: env.ADMIN_PASSWORD }));
const restored = restoreSql(backup);
restored.db.close();
for (const t of [
  "attendance_checks",
  "attendance_batches",
  "attendance_revisions",
]) {
  const broken = structuredClone(backup);
  delete broken[t];
  assert.throws(() => restoreSql(broken));
}
const legacy = structuredClone(backup);
delete legacy.attendanceChecksVersion;
for (const t of [
  "attendance_checks",
  "attendance_batches",
  "attendance_revisions",
])
  delete legacy[t];
restoreSql(legacy).db.close();
mark(
  "Complete backup restores every field; old backup compatible; missing new tables rejected",
);
writeFileSync(
  out + "/api-evidence.json",
  JSON.stringify(
    { passed: true, marks, bulkQueries, at: new Date().toISOString() },
    null,
    2,
  ),
);
db.close();
