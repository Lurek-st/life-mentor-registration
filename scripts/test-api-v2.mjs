import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({ connections: 16, pipelining: 1 }));
import { localTestURL } from "./test-safety.mjs";
const base = await localTestURL();
const password = readFileSync(".dev.vars", "utf8").match(
  /^ADMIN_PASSWORD="([^"]+)"/m,
)[1];
let cookie = "",
  rotated = false;
const evidence = [],
  made = [];
const mark = (x) => {
  evidence.push(x);
  console.log("PASS " + x);
};
async function req(
  p,
  data,
  method = data ? "POST" : "GET",
  auth = false,
  extra = {},
) {
  let r;
  for (let retry = 0; retry < 4; retry++) {
    try {
      r = await fetch(base + "/api" + p, {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          ...(auth ? { Cookie: cookie } : {}),
          ...extra,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(60000),
      });
      break;
    } catch (e) {
      if (retry === 3 || !(p === "/register" || method === "GET")) throw e;
      await new Promise((resolve) => setTimeout(resolve, 300 * (retry + 1)));
    }
  }
  let j;
  try {
    j = await r.json();
  } catch {
    j = { error: "non-json" };
  }
  return { status: r.status, j, headers: r.headers };
}
function status(r, n) {
  assert.equal(
    r.status,
    n,
    "HTTP " + r.status + " " + (r.j.code || "") + " " + (r.j.error || ""),
  );
  return r.j;
}
async function login(p = password) {
  const r = await req("/admin/login", { password: p });
  status(r, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
}
async function state() {
  return status(await req("/admin/state", undefined, "GET", true), 200);
}
async function fresh(id) {
  return (await state()).sessions.find((s) => s.id === id);
}
async function create(template, changes = {}) {
  const s = status(
    await req(
      "/admin/sessions",
      {
        ...template,
        title: "测试验证 " + randomUUID().slice(0, 6),
        state: "published",
        ...changes,
      },
      "POST",
      true,
    ),
    201,
  ).session;
  made.push(s.id);
  return s;
}
async function edit(s, changes = {}, ack = true) {
  return req(
    "/admin/sessions/" + s.id,
    { ...s, ...changes, ackImpact: ack, expectedBooked: s.booked },
    "PATCH",
    true,
  );
}
function person(s, employeeId = "TEST-" + randomBytes(10).toString("hex")) {
  return {
    sessionId: s.id,
    name: "虚构测试导师",
    department: "虚构测试部门",
    employeeId,
    contentRevision: s.content_version,
    requestId: randomUUID(),
    receipt: "mr_" + randomBytes(32).toString("hex"),
    consent: true,
  };
}
async function reg(s, employee) {
  const p = person(s, employee),
    r = await req("/register", p);
  status(r, 201);
  return { ...p, id: r.j.id };
}
async function mine(a) {
  return status(await req("/mine", { receipts: [a.receipt] }), 200)
    .registrations[0];
}
async function cancel(a) {
  status(await req("/cancel", { id: a.id, receipt: a.receipt }), 200);
}
const health = status(await req("/health"), 200);
assert.equal(
  health.mode,
  "preview",
  "SAFETY: tests only run in preview, never formal.",
);
await login();
try {
  const initial = status(await req("/sessions"), 200);
  assert.equal(initial.rounds.length >= 3, true);
  for (let i = 0; i < 12; i++) {
    const s = initial.sessions.find(
      (x) => x.id === "session-demo-" + String(i + 1).padStart(2, "0"),
    );
    assert.ok(s);
    assert.equal(s.capacity, 36);
    assert.equal(s.start_at - s.deadline_at, 48600);
    assert.equal(s.round_id, "round-" + (1 + Math.floor(i / 4)));
  }
  mark(
    "Fictional schedule: 12 future sessions, three rounds, default 36 and previous 22:00",
  );
  for (const path of [
    "/admin/state",
    "/admin/backup",
    "/admin/export-data",
    "/admin/audit",
  ])
    status(await req(path), 401);
  assert.equal("registrations" in initial, false);
  assert.ok(!JSON.stringify(initial).includes("employee_id"));
  status(
    await req("/register", person(initial.sessions[0]), "POST", false, {
      Origin: "https://unrelated.example",
    }),
    403,
  );
  mark(
    "Public privacy, protected admin/export/backup/audit and cross-origin writes",
  );
  const template = initial.sessions.at(-1),
    race = await create(template, { capacity: 2 });
  const a = await reg(race, "TEST-0000123");
  const replay = status(await req("/register", a), 200);
  assert.equal(replay.id, a.id);
  const conflict = await req("/register", { ...a, name: "其他测试姓名" });
  status(conflict, 409);
  assert.equal(conflict.j.code, "REQUEST_CONFLICT");
  status(await req("/register", person(race, "test-0000123")), 409);
  assert.equal((await mine(a)).employee_id, "TEST-0000123");
  assert.equal(
    status(await req("/mine", { receipts: ["mr_" + "0".repeat(64)] }), 200)
      .registrations.length,
    0,
  );
  status(
    await req("/cancel", { id: a.id, receipt: "mr_" + "0".repeat(64) }),
    404,
  );
  mark(
    "Employee normalization, preserved leading zeros, deduplication, replay and receipt ownership",
  );
  const attempts = await Promise.all(
    Array.from({ length: 100 }, () => req("/register", person(race))),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 1);
  assert.equal(attempts.filter((r) => r.j.code === "SESSION_FULL").length, 99);
  assert.equal((await fresh(race.id)).booked, 2);
  mark(
    "100 simultaneous submissions for one remaining place: exactly one accepted",
  );
  let current = await fresh(race.id);
  status(await edit(current, { capacity: 1 }, false), 409);
  const reduced = status(await edit(current, { capacity: 1 }), 200).session;
  assert.equal(reduced.over_capacity, 1);
  assert.equal(reduced.booked, 2);
  status(await req("/register", person(reduced)), 409);
  const upgraded = status(await edit(reduced, { capacity: 40 }), 200).session;
  assert.equal(upgraded.remaining, 38);
  mark("Capacity can exceed36 or drop below bookings without deleting anyone");
  const concurrent = await Promise.all([
    edit(upgraded, { deadline_at: upgraded.deadline_at - 1800 }),
    edit(upgraded, { venue: "并发修改的测试地点" }),
  ]);
  assert.equal(concurrent.filter((x) => x.status === 200).length, 1);
  assert.equal(
    concurrent.filter((x) => x.j.code === "EDIT_CONFLICT").length,
    1,
  );
  const missing = await req(
    "/admin/sessions/" + randomUUID(),
    { ...upgraded },
    "PATCH",
    true,
  );
  status(missing, 404);
  mark("Concurrent staff edits reject stale versions; missing session is404");
  current = await fresh(race.id);
  const moved = status(
    await edit(current, {
      start_at: current.start_at + 32 * 86400,
      end_at: current.end_at + 32 * 86400,
      deadline_at: current.deadline_at + 32 * 86400,
      change_note: "跨月延期测试",
    }),
    200,
  ).session;
  assert.equal(moved.round_id, current.round_id);
  assert.equal(moved.id, current.id);
  const stale = await req("/register", person(current));
  status(stale, 409);
  assert.equal(stale.j.code, "SESSION_CHANGED");
  assert.equal((await mine(a)).content_changed, true);
  status(
    await req("/confirm-change", {
      id: a.id,
      receipt: a.receipt,
      contentRevision: current.content_version,
    }),
    409,
  );
  status(
    await req("/confirm-change", {
      id: a.id,
      receipt: a.receipt,
      contentRevision: moved.content_version,
    }),
    200,
  );
  assert.equal((await mine(a)).content_changed, false);
  mark(
    "Cross-month postponement preserves round/id; old teacher page rejected and confirmed change recoverable",
  );
  await cancel(a);
  await cancel(a);
  assert.equal((await fresh(race.id)).booked, 1);
  const cancelled = status(
    await edit(await fresh(race.id), { state: "cancelled" }),
    200,
  ).session;
  status(await req("/register", person(cancelled)), 409);
  const archived = status(
    await edit(cancelled, { state: "archived" }),
    200,
  ).session;
  assert.ok(
    !status(await req("/sessions"), 200).sessions.some(
      (s) => s.id === archived.id,
    ),
  );
  const restored = status(
    await edit(archived, { state: "published" }),
    200,
  ).session;
  assert.equal(restored.booked, 1);
  assert.ok((await mine(a)).cancelled_at);
  mark(
    "Cancellation releases one place idempotently; event cancel/archive/restore does not revive cancelled people",
  );
  const deadline = await create(template, {
    deadline_at: Math.floor(Date.now() / 1000) - 10,
  });
  const closed = await req("/register", person(deadline));
  status(closed, 409);
  assert.equal(closed.j.code, "DEADLINE_PASSED");
  mark("Past deadline enforced by server even with old page");
  const massive = await create(template, { capacity: 1000 });
  const burst = await Promise.all(
    Array.from({ length: 500 }, () => req("/register", person(massive))),
  );
  assert.equal(burst.filter((r) => r.status === 201).length, 500);
  assert.equal((await fresh(massive.id)).booked, 500);
  mark("500 concurrent users sharing one IP: all500 accepted, exact count500");
  const round = status(
    await req(
      "/admin/rounds",
      { title: "第四轮 测试", sort_order: 99 },
      "POST",
      true,
    ),
    201,
  );
  const sameDay = await create(template, { round_id: round.id });
  await create(sameDay, { title: "同日另一场测试" });
  mark("Extra rounds, arbitrary event count and multiple events on one day");
  const lead = await reg(sameDay, "TEST-００００４２");
  assert.equal((await mine(lead)).employee_id, "TEST-000042");
  let record = status(
    await req(
      "/admin/registrations?session=" + sameDay.id,
      undefined,
      "GET",
      true,
    ),
    200,
  ).records.find((x) => x.id === lead.id);
  status(
    await req(
      "/admin/registrations/" + record.id,
      {
        version: record.version,
        name: "更正后的虚构姓名",
        department: "更正测试部门",
        employeeId: "TEST-0000042",
      },
      "PATCH",
      true,
    ),
    200,
  );
  assert.equal((await mine(lead)).employee_id, "TEST-0000042");
  const exported = status(
    await req(
      "/admin/export-data?session=" + sameDay.id,
      undefined,
      "GET",
      true,
    ),
    200,
  ).records;
  assert.equal(exported.length, 1);
  assert.equal(exported[0].employee_id, "TEST-0000042");
  assert.ok(exported[0].session_title);
  mark(
    "Staff correction, fullwidth normalization and filtered export preserve employee string",
  );
  const cfg = (await state()).settings;
  const cfgPayload = {
    ...cfg,
    version: Number(cfg.version),
    max_sessions: 0,
    self_cancel: true,
    registration_open: true,
  };
  const settingRace = await Promise.all([
    req(
      "/admin/settings",
      { ...cfgPayload, contact: "测试联系人甲" },
      "PATCH",
      true,
    ),
    req(
      "/admin/settings",
      { ...cfgPayload, contact: "测试联系人乙" },
      "PATCH",
      true,
    ),
  ]);
  assert.equal(settingRace.filter((x) => x.status === 200).length, 1);
  assert.equal(
    settingRace.filter((x) => x.j.code === "EDIT_CONFLICT").length,
    1,
  );
  let nowcfg = (await state()).settings;
  status(
    await req(
      "/admin/settings",
      {
        ...cfgPayload,
        version: Number(nowcfg.version),
        registration_open: false,
      },
      "PATCH",
      true,
    ),
    200,
  );
  const shut = await req("/register", person(sameDay));
  status(shut, 409);
  assert.equal(shut.j.code, "REGISTRATION_CLOSED");
  nowcfg = (await state()).settings;
  status(
    await req(
      "/admin/settings",
      { ...cfgPayload, version: Number(nowcfg.version), contact: cfg.contact },
      "PATCH",
      true,
    ),
    200,
  );
  mark(
    "Settings update is transactional, rejects stale edits, global closure enforced",
  );
  const backup = status(
    await req("/admin/backup", undefined, "GET", true),
    200,
  );
  assert.equal(backup.schemaVersion, 2);
  assert.ok(!JSON.stringify(backup).includes(password));
  assert.ok(!backup.settings.admin_password_digest);
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("schema/v2.sql", "utf8"));
  db.exec("DROP TRIGGER registration_gate_v2");
  db.exec("BEGIN");
  for (const table of ["rounds", "sessions", "registrations", "audit"])
    for (const row of backup[table]) {
      const v = {
        ...row,
        ...(table === "sessions" ? { booked_count: 0 } : {}),
      };
      const keys = Object.keys(v);
      db.prepare(
        "INSERT INTO " +
          table +
          " (" +
          keys.join(",") +
          ") VALUES (" +
          keys.map(() => "?").join(",") +
          ")",
      ).run(...Object.values(v));
    }
  for (const [key, value] of Object.entries(backup.settings))
    db.prepare("UPDATE settings SET value=? WHERE key=?").run(value, key);
  db.exec("COMMIT");
  db.exec(readFileSync("schema/v2.sql", "utf8"));
  for (const s of backup.sessions)
    assert.equal(
      db.prepare("SELECT booked_count FROM sessions WHERE id=?").get(s.id)
        .booked_count,
      s.booked_count,
    );
  assert.equal(
    db.prepare("SELECT count(*) n FROM registrations").get().n,
    backup.registrations.length,
  );
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
  mark(
    "Backup transaction exports consistent snapshot; full restore rehearsal counts/integrity/foreign keys pass",
  );
  const oldCookie = cookie,
    newPassword = "TestOnly-" + randomBytes(20).toString("hex");
  status(
    await req(
      "/admin/password",
      { currentPassword: password, newPassword },
      "POST",
      true,
    ),
    200,
  );
  rotated = true;
  status(await req("/admin/state", undefined, "GET", true), 401);
  status(await req("/admin/login", { password }), 401);
  await login(newPassword);
  status(
    await req(
      "/admin/password",
      { currentPassword: newPassword, newPassword: password },
      "POST",
      true,
    ),
    200,
  );
  rotated = false;
  await login();
  status(await req("/admin/logout", {}, "POST", true), 200);
  status(await req("/admin/state", undefined, "GET", true), 401);
  await login();
  mark(
    "Password rotation revokes existing cookies and old password; logout revokes server session",
  );
  const audit = status(
    await req("/admin/audit?target=" + race.id, undefined, "GET", true),
    200,
  ).records;
  assert.ok(audit.some((x) => x.before && x.after));
  mark("Staff changes preserve before/after audit records");
} finally {
  if (!rotated) {
    for (const id of made) {
      try {
        const s = await fresh(id);
        if (s) status(await edit(s, { state: "archived" }), 200);
      } catch {
        console.log("Cleanup requires follow-up for synthetic test session");
      }
    }
  }
  mkdirSync("work", { recursive: true });
  writeFileSync(
    "work/v2-" +
      (base.includes("127.0.0.1") ? "local" : "cloud") +
      "-evidence.json",
    JSON.stringify(
      {
        time: new Date().toISOString(),
        base,
        passed: evidence,
        syntheticOnly: true,
        transportConnections: 16,
      },
      null,
      2,
    ),
  );
}
console.log("Completed " + evidence.length + " verification groups.");
