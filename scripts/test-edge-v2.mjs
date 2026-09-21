import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { localTestURL } from "./test-safety.mjs";
const base = await localTestURL();
const password = readFileSync(".dev.vars", "utf8").match(
  /^ADMIN_PASSWORD="([^"]+)"/m,
)[1];
let cookie = "";
async function request(p, b, m = b ? "POST" : "GET") {
  const r = await fetch(base + "/api" + p, {
    method: m,
    headers: {
      Cookie: cookie,
      ...(b ? { "Content-Type": "application/json" } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  return {
    status: r.status,
    j: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
function ok(r, n = 200) {
  assert.equal(r.status, n, r.j.code + " " + r.j.error);
  return r.j;
}
assert.equal(ok(await request("/health")).mode, "preview");
cookie = (await request("/admin/login", { password })).cookie;
const state = () => request("/admin/state").then(ok),
  start = await state(),
  made = [],
  orig = start.settings;
async function config(values) {
  const s = (await state()).settings;
  return request(
    "/admin/settings",
    {
      ...s,
      version: Number(s.version),
      max_sessions: Number(s.max_sessions),
      self_cancel: s.self_cancel === "true",
      registration_open: s.registration_open === "true",
      ...values,
    },
    "PATCH",
  ).then(ok);
}
const fresh = async (id) => (await state()).sessions.find((s) => s.id === id);
async function edit(s, v, ack = true) {
  return request(
    "/admin/sessions/" + s.id,
    { ...s, ...v, ackImpact: ack, expectedBooked: s.booked },
    "PATCH",
  );
}
function payload(s, id) {
  return {
    sessionId: s.id,
    name: "边界验证虚构姓名",
    department: "测试部门",
    employeeId: id || "TEST-" + randomUUID(),
    contentRevision: s.content_version,
    requestId: randomUUID(),
    receipt: "mr_" + randomBytes(32).toString("hex"),
    consent: true,
  };
}
try {
  for (let i = 0; i < 2; i++) {
    const s = ok(
      await request("/admin/sessions", {
        ...start.sessions.find((s) => s.state === "published"),
        title: "边界验证 " + randomUUID().slice(0, 6),
        capacity: 10,
      }),
      201,
    ).session;
    made.push(s);
  }
  const [a, b] = made;
  await config({ max_sessions: 1 });
  const person = payload(a),
    booking = ok(await request("/register", person), 201);
  const limited = await request("/register", payload(b, person.employeeId));
  assert.equal(limited.j.code, "PERSON_LIMIT");
  let s = await fresh(a.id);
  assert.equal(
    (await edit(s, { state: "draft" }, false)).j.code,
    "IMPACT_CONFIRM",
  );
  const staleCount = await request(
    "/admin/sessions/" + s.id,
    { ...s, state: "cancelled", ackImpact: true, expectedBooked: 0 },
    "PATCH",
  );
  assert.equal(staleCount.j.code, "IMPACT_STALE");
  await config({ self_cancel: false });
  let mine = ok(await request("/mine", { receipts: [person.receipt] }))
    .registrations[0];
  assert.equal(mine.can_cancel, false);
  assert.equal(
    (await request("/cancel", { id: booking.id, receipt: person.receipt })).j
      .code,
    "CANNOT_CANCEL",
  );
  await config({ self_cancel: true });
  ok(await edit(s, { deadline_at: Math.floor(Date.now() / 1000) - 10 }));
  assert.equal(
    (await request("/cancel", { id: booking.id, receipt: person.receipt })).j
      .code,
    "CANNOT_CANCEL",
  );
  s = await fresh(a.id);
  ok(await edit(s, { venue: "变更后的测试地点" }));
  mine = ok(await request("/mine", { receipts: [person.receipt] }))
    .registrations[0];
  assert.equal(mine.can_cancel, true);
  ok(await request("/cancel", { id: booking.id, receipt: person.receipt }));
  assert.equal((await fresh(a.id)).booked, 0);
  const after = ok(
    await request("/register", payload(b, person.employeeId)),
    201,
  );
  assert.ok(after.id);
  const report = {
    passed: true,
    base,
    checks: [
      "Per-person limit and cancellation release",
      "Draft withdrawal requires impact confirmation",
      "Stale impact count rejected",
      "Self cancellation disabled in UI and API",
      "Deadline blocks self cancel until material change reopens decision window",
    ],
  };
  writeFileSync(
    "work/v2-edge-" +
      (base.includes("127.0.0.1") ? "local" : "cloud") +
      ".json",
    JSON.stringify(report, null, 2),
  );
  console.log("PASS " + report.checks.join("; "));
} finally {
  await config({
    max_sessions: Number(orig.max_sessions),
    self_cancel: orig.self_cancel === "true",
    registration_open: orig.registration_open === "true",
  });
  for (const s of made)
    ok(await edit(await fresh(s.id), { state: "archived" }));
}
