// Synthetic-only second-pass cases. --baseline records the two original gaps.
import assert from "node:assert/strict";
import { fixture, req, payload, bundle, worker } from "./security-fixture.mjs";
import { unzipSync, strFromU8 } from "fflate";
const baseline = process.argv.includes("--baseline");
const findings = [],
  checks = [];
const mark = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const login = async (f) => {
  const r = await req(f, "/admin/login", { password: f.env.ADMIN_PASSWORD });
  assert.equal(r.status, 200);
  return { cookie: r.headers.get("set-cookie").split(";")[0] };
};
for (const [name, sql, extra, expected] of [
  ["missing", null, { sessionId: "missing" }, 404],
  ["deadline", "UPDATE sessions SET deadline_at=unixepoch()-1", {}, 409],
  ["paused", "UPDATE sessions SET state='paused'", {}, 409],
  ["draft", "UPDATE sessions SET state='draft'", {}, 409],
  ["cancelled", "UPDATE sessions SET state='cancelled'", {}, 409],
  ["archived", "UPDATE sessions SET state='archived'", {}, 409],
  ["full", "UPDATE sessions SET booked_count=capacity", {}, 409],
  ["changed", "UPDATE sessions SET content_version=2", {}, 409],
]) {
  const f = fixture();
  if (sql) f.db.exec(sql);
  const before = f.metrics(),
    result = await req(f, "/register", payload("10000001", extra));
  assert.equal(result.status, expected, name);
  const delta = {
    calls: f.metrics().calls - before.calls,
    writes: f.metrics().changes - before.changes,
  };
  findings.push({ case: name, ...delta });
  if (!baseline) assert.equal(delta.writes, 0, name);
  f.db.close();
}
if (!baseline)
  mark(
    "Unavailable sessions reject before quota writes (missing, deadline, pause, draft, cancel, archive, full, changed)",
  );
{
  const f = fixture(),
    auth = await login(f),
    statuses = [];
  for (let i = 0; i < 12; i++)
    statuses.push(
      (
        await req(
          f,
          "/admin/password",
          { currentPassword: "wrong", newPassword: "synthetic-new-password" },
          auth,
        )
      ).status,
    );
  findings.push({ case: "authenticated-old-password-guess", statuses });
  if (!baseline) {
    assert.deepEqual(statuses, [...Array(10).fill(401), 429, 429]);
    const before = f.metrics();
    assert.equal(
      (await req(f, "/admin/backup", { password: "wrong" }, auth)).status,
      429,
    );
    assert.equal(f.metrics().changes, before.changes);
    mark(
      "Password change and backup share reauthentication quota; switching endpoints cannot reset it",
    );
  }
  f.db.close();
}
if (baseline) {
  console.log(
    JSON.stringify(
      { baseline: true, at: new Date().toISOString(), findings },
      null,
      2,
    ),
  );
  process.exit(0);
}
{
  const f = fixture(),
    p = payload(),
    saved = await req(f, "/register", p);
  assert.equal(saved.status, 201);
  f.db.exec(
    "UPDATE sessions SET deadline_at=unixepoch()-1,state='cancelled',content_version=2",
  );
  const before = f.metrics(),
    replay = await req(f, "/register", p);
  assert.equal(replay.status, 200);
  assert.equal(replay.j.id, saved.j.id);
  assert.equal(f.metrics().changes, before.changes);
  f.db.close();
  mark(
    "Exact successful retry remains recoverable after deadline, cancellation and content changes",
  );
}
{
  const f = fixture(),
    p = payload();
  f.db.exec("UPDATE sessions SET capacity=1");
  const prepare = f.env.DB.prepare;
  let raced = false;
  f.env.DB.prepare = (sql) => {
    const initial = prepare(sql);
    if (!sql.startsWith("SELECT id,receipt_hash,request_fingerprint"))
      return initial;
    return {
      ...initial,
      bind(...args) {
        const bound = initial.bind(...args),
          first = bound.first;
        bound.first = async () => {
          const result = await first();
          if (!raced && result === null) {
            raced = true;
            assert.equal((await req(f, "/register", p)).status, 201);
          }
          return result;
        };
        return bound;
      },
    };
  };
  const retried = await req(f, "/register", p);
  assert.equal(retried.status, 200);
  assert.equal(retried.j.replayed, true);
  assert.equal(f.db.prepare("SELECT count(*) n FROM registrations").get().n, 1);
  f.db.close();
  mark(
    "In-flight duplicate finishing between replay lookup and full-session check still recovers the successful result",
  );
}
{
  const f = fixture(),
    prepare = f.env.DB.prepare;
  let raced = false;
  f.env.DB.prepare = (sql) => {
    const initial = prepare(sql);
    if (sql !== "SELECT * FROM sessions WHERE id=?") return initial;
    return {
      ...initial,
      bind(...args) {
        const bound = initial.bind(...args),
          first = bound.first;
        bound.first = async () => {
          const result = await first();
          if (!raced) {
            raced = true;
            f.db.exec("UPDATE sessions SET state='paused'");
          }
          return result;
        };
        return bound;
      },
    };
  };
  assert.equal(
    (await req(f, "/register", payload())).j.code,
    "SESSION_UNAVAILABLE",
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM registrations").get().n, 0);
  f.db.close();
  mark(
    "Database insert guard still blocks state changes occurring after the early availability check",
  );
}
{
  const f = fixture(),
    before = f.metrics();
  for (const [path, method] of [
    ["/admin/combined-export?session=future", "GET"],
    ["/admin/attendance-review?session=future", "GET"],
    ["/admin/attendance-term?sessions=future", "GET"],
    ["/admin/attendance-batch?id=guess", "GET"],
    ["/admin/attendance-export", "GET"],
    ["/admin/attendance", "POST"],
    ["/admin/registrations", "POST"],
    ["/admin/password", "POST"],
    ["/admin/settings", "PATCH"],
    ["/admin/backup", "POST"],
  ])
    for (const cookie of [undefined, "mentor_admin_v2=bad"])
      assert.equal(
        (
          await req(f, path, method === "GET" ? undefined : {}, {
            method,
            cookie,
          })
        ).status,
        401,
        path,
      );
  assert.deepEqual(f.metrics(), before);
  const forged = "mentor_admin_v2=" + "a".repeat(64);
  assert.equal(
    (await req(f, "/admin/export-data", undefined, { cookie: forged })).status,
    401,
  );
  const auth = await login(f);
  f.db.exec("UPDATE admin_sessions SET expires_at=unixepoch()-1");
  assert.equal(
    (await req(f, "/admin/attendance-term?sessions=future", undefined, auth))
      .status,
    401,
  );
  f.db.close();
  mark(
    "All newer staff routes reject missing, malformed, forged or expired staff authentication",
  );
}
{
  const f = fixture(),
    auth = await login(f),
    before = f.metrics();
  assert.equal(
    (
      await req(
        f,
        "/admin/password",
        {
          currentPassword: f.env.ADMIN_PASSWORD,
          newPassword: "synthetic-password-2",
        },
        { ...auth, headers: { Origin: "https://other.invalid" } },
      )
    ).status,
    403,
  );
  assert.deepEqual(f.metrics(), before);
  const change = await req(
    f,
    "/admin/password",
    {
      currentPassword: f.env.ADMIN_PASSWORD,
      newPassword: "synthetic-password-2",
    },
    auth,
  );
  assert.equal(change.status, 200);
  assert.equal((await req(f, "/admin/state", undefined, auth)).status, 401);
  assert.equal(
    (await req(f, "/admin/login", { password: f.env.ADMIN_PASSWORD })).status,
    401,
  );
  assert.equal(
    (await req(f, "/admin/login", { password: "synthetic-password-2" })).status,
    200,
  );
  f.db.close();
  mark(
    "Legitimate password rotation works, rejects cross-site calls and invalidates old login sessions",
  );
}
{
  const f = fixture(),
    before = f.metrics();
  for (const [text, type, status] of [
    ["{bad", "application/json", 400],
    ["null", "application/json", 400],
    ["[]", "application/json", 400],
    ["x".repeat(65537), "application/json", 413],
    ["{}", "text/plain", 415],
  ]) {
    const r = await worker.fetch(
      new Request("https://mentor.example.test/api/register", {
        method: "POST",
        headers: { "Content-Type": type },
        body: text,
      }),
      f.env,
    );
    assert.equal(r.status, status);
  }
  assert.deepEqual(f.metrics(), before);
  const data = payload("10000001", {
    name: "' OR 1=1; -- <script>alert(1)</script>",
    department: '=HYPERLINK("https://example.invalid")',
  });
  assert.equal((await req(f, "/register", data)).status, 201);
  const auth = await login(f),
    search = await req(
      f,
      "/admin/export-data?q=" + encodeURIComponent("%' OR 1=1 --"),
      undefined,
      auth,
    );
  assert.equal(search.status, 200);
  assert.equal(search.j.records.length, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM registrations").get().n, 1);
  const publicData = JSON.stringify((await req(f, "/sessions")).j);
  assert.ok(!publicData.includes(data.name));
  assert.ok(!publicData.includes(data.email));
  const { workbook } = await bundle("src/export.ts"),
    files = unzipSync(
      workbook([
        ["姓名", "部门", "工号"],
        [data.name, data.department, "00000100"],
      ]),
    );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.ok(sheet.includes("&lt;script&gt;"));
  assert.ok(sheet.includes("00000100"));
  assert.ok(!sheet.includes("<f>"));
  assert.ok(sheet.includes('t="inlineStr"'));
  f.db.close();
  mark(
    "Malformed/oversize bodies stop before DB; SQL payloads stay literal; export formula payloads remain text",
  );
}
{
  const { calendarFile } = await bundle("shared/calendar.ts"),
    f = fixture();
  const s = (await req(f, "/sessions")).j.sessions[0];
  const ics = calendarFile({
    ...s,
    title: "Test\r\nATTENDEE:mailto:other@example.invalid",
    venue: "A;B,C\\D",
  });
  assert.ok(!ics.includes("\r\nATTENDEE:"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  f.db.close();
  mark(
    "Calendar control characters cannot inject an attendee or another event",
  );
}
console.log(
  JSON.stringify(
    {
      passed: true,
      at: new Date().toISOString(),
      checks,
      measurements: findings,
      scope:
        "Synthetic in-memory routes and exports; no live attack/load/real data",
    },
    null,
    2,
  ),
);
