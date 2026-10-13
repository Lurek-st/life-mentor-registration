import assert from "node:assert/strict";
import { fixture, req, payload, bundle } from "./security-fixture.mjs";
import { createHmac } from "node:crypto";
const results = [];
function pass(name) {
  results.push(name);
  console.log("PASS " + name);
}
const hmac = (f, s) =>
  createHmac("sha256", f.env.APP_SECRET).update(s).digest("hex");
{
  const f = fixture(),
    before = f.metrics();
  for (const path of ["/sessions", "/admin/login", "/register", "/health"])
    assert.equal(
      (
        await req(
          f,
          path,
          path.includes("login") ? { password: "anything" } : undefined,
          { base: "https://deadbeef.mentor.example.test" },
        )
      ).status,
      410,
    );
  assert.deepEqual(f.metrics(), before);
  assert.equal((await req(f, "/health")).status, 200);
  f.db.close();
  pass(
    "Alternate formal hosts denied before any DB use; canonical control succeeds",
  );
}
{
  const f = fixture();
  for (const extra of [
    { employeeId: "invalid id" },
    { employeeId: "!" },
    { email: "not-an-email" },
    { email: undefined },
  ]) {
    const before = f.metrics();
    assert.equal(
      (await req(f, "/register", payload("10000001", extra))).status,
      400,
    );
    assert.equal(f.metrics().changes, before.changes);
  }
  const p = payload(),
    created = await req(f, "/register", p);
  assert.equal(created.status, 201);
  let before = f.metrics();
  assert.equal((await req(f, "/register", p)).j.id, created.j.id);
  assert.equal(f.metrics().changes, before.changes);
  p.employeeId = "1000001";
  const fingerprint = hmac(
    f,
    JSON.stringify([
      p.sessionId,
      p.name,
      p.department,
      p.employeeId,
      p.contentRevision,
      p.email,
    ]),
  );
  f.db
    .prepare(
      "UPDATE registrations SET employee_id=?,employee_hash=?,request_fingerprint=? WHERE id=?",
    )
    .run(
      p.employeeId,
      hmac(f, "employee:" + p.employeeId),
      fingerprint,
      created.j.id,
    );
  assert.equal((await req(f, "/register", p)).j.id, created.j.id);
  assert.equal(
    (await req(f, "/register", { ...p, name: "另一个人" })).status,
    409,
  );
  delete p.email;
  f.db
    .prepare("UPDATE registrations SET request_fingerprint=? WHERE id=?")
    .run(
      hmac(
        f,
        JSON.stringify([
          p.sessionId,
          p.name,
          p.department,
          p.employeeId,
          p.contentRevision,
        ]),
      ),
      created.j.id,
    );
  assert.equal((await req(f, "/register", p)).j.id, created.j.id);
  f.db.close();
  pass(
    "Malformed new signup does not write DB; exact old no-email replay still recovers; altered replay denied",
  );
}
{
  const f = fixture(),
    p = payload(),
    r = await req(f, "/register", p);
  assert.equal(r.status, 201);
  f.db.prepare("UPDATE sessions SET content_version=2 WHERE id='future'").run();
  const data = { id: r.j.id, receipt: p.receipt, contentRevision: 2 };
  assert.equal((await req(f, "/confirm-change", data)).status, 200);
  const v = f.db
      .prepare("SELECT version FROM registrations WHERE id=?")
      .get(r.j.id).version,
    b = f.metrics();
  for (let i = 0; i < 8; i++)
    assert.equal((await req(f, "/confirm-change", data)).status, 200);
  assert.equal(f.metrics().changes, b.changes);
  assert.equal(
    f.db.prepare("SELECT version FROM registrations WHERE id=?").get(r.j.id)
      .version,
    v,
  );
  assert.equal(
    (await req(f, "/confirm-change", { ...data, contentRevision: 1 })).status,
    409,
  );
  f.db
    .prepare("UPDATE registrations SET cancelled_at=unixepoch() WHERE id=?")
    .run(r.j.id);
  assert.equal((await req(f, "/confirm-change", data)).status, 409);
  f.db.close();
  pass(
    "Repeated confirmation is idempotent with zero repeated writes; obsolete/cancelled requests remain rejected",
  );
}
{
  const f = fixture(),
    b = f.metrics();
  assert.equal(
    (await req(f, "/mine", { receipts: ["mr_" + "a".repeat(64)] })).j
      .registrations.length,
    0,
  );
  assert.equal(f.metrics().calls - b.calls, 1);
  assert.equal(f.metrics().changes, b.changes);
  for (const cookie of [undefined, "mentor_admin_v2=bad"]) {
    const b = f.metrics();
    assert.equal((await req(f, "/admin/logout", {}, { cookie })).status, 200);
    assert.deepEqual(f.metrics(), b);
  }
  const p = payload(),
    a = await req(f, "/register", p),
    q = payload("10000002");
  await req(f, "/register", q);
  const own = await req(f, "/mine", { receipts: [p.receipt] });
  assert.equal(own.j.registrations.length, 1);
  assert.equal(own.j.registrations[0].id, a.j.id);
  assert.equal(own.j.registrations[0].receiptIndex, 0);
  assert.ok(!JSON.stringify(own.j).includes(q.receipt));
  f.db.close();
  pass(
    "Unknown receipts use only one indexed lookup; malformed logout uses no DB; real receipts stay isolated",
  );
}
{
  const f = fixture(),
    b = f.metrics();
  for (let i = 0; i < 20; i++)
    assert.equal((await req(f, "/sessions?noise=" + i)).status, 200);
  assert.equal(f.metrics().calls - b.calls, 3);
  const f2 = fixture();
  f2.db.prepare("UPDATE sessions SET title='另一个数据库'").run();
  assert.equal(
    (await req(f2, "/sessions")).j.sessions[0].title,
    "另一个数据库",
  );
  const r = await req(f, "/register", payload());
  assert.equal(r.status, 201);
  assert.equal((await req(f, "/sessions")).j.sessions[0].booked, 1);
  const original = Date.now;
  const clock = original();
  f.db
    .prepare("UPDATE sessions SET deadline_at=?")
    .run(Math.floor(clock / 1000) + 3);
  try {
    Date.now = () => clock + 2100;
    assert.equal((await req(f, "/sessions")).j.sessions[0].status, "open");
    const calls = f.metrics().calls;
    Date.now = () => clock + 3150;
    assert.equal((await req(f, "/sessions")).j.sessions[0].status, "closed");
    assert.equal(f.metrics().calls, calls);
  } finally {
    Date.now = original;
  }
  f.db.close();
  f2.db.close();
  pass(
    "Public cache coalesces query variants, isolates DB bindings, invalidates after successful writes, and respects current deadline",
  );
}
{
  const f = fixture();
  const l = await req(f, "/admin/login", { password: f.env.ADMIN_PASSWORD });
  assert.equal(l.status, 200);
  const opts = { cookie: l.headers.get("set-cookie").split(";")[0] };
  assert.equal((await req(f, "/admin/backup", undefined, opts)).status, 401);
  assert.equal(
    (await req(f, "/admin/backup", { password: "wrong-password" }, opts))
      .status,
    401,
  );
  assert.equal(
    (await req(f, "/admin/backup", { password: f.env.ADMIN_PASSWORD })).status,
    401,
  );
  const b = await req(
    f,
    "/admin/backup",
    { password: f.env.ADMIN_PASSWORD },
    opts,
  );
  assert.equal(b.status, 200);
  assert.equal(
    (
      await req(f, "/admin/backup", undefined, {
        ...opts,
        headers: { "X-Staff-Password": f.env.ADMIN_PASSWORD },
      })
    ).status,
    200,
  );
  assert.ok(!JSON.stringify(b.j).includes(f.env.ADMIN_PASSWORD));
  const { encryptBackup, decryptBackup } = await bundle(
    "shared/backupCrypto.ts",
  );
  const secret = "synthetic-backup-passphrase-only";
  const data = {
    ...b.j,
    syntheticPrivateText: "不可作为公开数据",
    leadingZero: "00001234",
  };
  const a = await encryptBackup(data, secret),
    c = await encryptBackup(data, secret);
  assert.notEqual(a.iv, c.iv);
  assert.notEqual(a.salt, c.salt);
  assert.ok(!JSON.stringify(a).includes(data.syntheticPrivateText));
  assert.deepEqual(await decryptBackup(a, secret), data);
  await assert.rejects(decryptBackup(a, "wrong"));
  await assert.rejects(
    decryptBackup(
      {
        ...a,
        ciphertext:
          (a.ciphertext.startsWith("00") ? "01" : "00") + a.ciphertext.slice(2),
      },
      secret,
    ),
  );
  await assert.rejects(decryptBackup({ ...a, iterations: 1 }, secret));
  assert.equal((await req(f, "/admin/logout", {}, opts)).status, 200);
  assert.equal((await req(f, "/admin/state", undefined, opts)).status, 401);
  f.db.close();
  pass(
    "Backup requires login and fresh password; portable encryption round-trips Chinese/leading zeros and rejects wrong password/tampering",
  );
}
{
  const f = fixture();
  for (let i = 0; i < 100; i++)
    assert.equal(
      (
        await req(f, "/register", payload(String(10001000 + i)), {
          ip: "198.51.100.90",
        })
      ).status,
      201,
    );
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await req(
          f,
          "/register",
          payload(String(10002000 + i), {
            email: "same.person@example.invalid",
          }),
          { ip: "198.51.100.91" },
        )
      ).status,
      201,
    );
  assert.equal(
    (
      await req(
        f,
        "/register",
        payload("10002999", { email: "same.person@example.invalid" }),
        { ip: "198.51.100.92" },
      )
    ).status,
    429,
  );
  f.db.close();
  pass(
    "100 distinct teachers on shared campus IP succeed; rotating employee numbers cannot bypass per-email rate limit",
  );
}
console.log(
  JSON.stringify({
    passed: true,
    groups: results.length,
    checks: results,
    scope:
      "Synthetic in-memory data; not distributed DDoS or school identity verification",
    at: new Date().toISOString(),
  }),
);
