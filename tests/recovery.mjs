// Regression cases use only synthetic records and unique, local-only databases.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { fixture, req, payload, bundle } from "./security-fixture.mjs";
import { restoreSql, businessTables } from "../scripts/restore-model.mjs";

const mark = (text) => console.log("PASS " + text);
const login = async (f) => {
  const r = await req(f, "/admin/login", { password: f.env.ADMIN_PASSWORD });
  assert.equal(r.status, 200);
  return { cookie: r.headers.get("set-cookie").split(";")[0] };
};
{
  const f = fixture();
  for (const field of ["name", "department"])
    for (const control of ["\0", "\u001b", "\u0085", "\u000b"])
      assert.equal(
        (
          await req(
            f,
            "/register",
            payload("00000001", { [field]: "合成" + control + "文本" }),
          )
        ).status,
        400,
      );
  assert.equal(f.db.prepare("SELECT count(*) n FROM registrations").get().n, 0);
  const name = "合成 O'Neil 😀",
    department = "测试\t部门\r\n第二行";
  assert.equal(
    (await req(f, "/register", payload("00000001", { name, department })))
      .status,
    201,
  );
  assert.equal(f.db.prepare("SELECT name FROM registrations").get().name, name);
  f.db.close();
  mark(
    "control characters rejected before saving; Chinese, emoji, apostrophe and ordinary whitespace remain valid",
  );
}
{
  const f = fixture(),
    password = "synthetic-legacy-\0-password";
  f.db.prepare("INSERT INTO settings VALUES('admin_password_digest',?)").run(
    createHmac("sha256", f.env.APP_SECRET)
      .update("password:" + password)
      .digest("hex"),
  );
  f.env.ADMIN_PASSWORD = password;
  const auth = await login(f);
  assert.equal((await req(f, "/admin/backup", { password }, auth)).status, 200);
  assert.equal(
    (
      await req(
        f,
        "/admin/password",
        { currentPassword: password, newPassword: "synthetic-new-\0-password" },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        f,
        "/admin/password",
        {
          currentPassword: password,
          newPassword: "synthetic-new-clean-password",
        },
        auth,
      )
    ).status,
    200,
  );
  f.db.close();
  mark(
    "legacy credential still logs in, reauthenticates and rotates; new control-character password rejected",
  );
}
{
  let schema = readFileSync("tests/fixtures/v2/v2.sql", "utf8");
  const missing = async (schema) => {
    const f = fixture("formal", schema);
    const r = await req(f, "/health");
    assert.equal(r.status, 503);
    assert.equal(r.j.code, "DB_UPGRADE_REQUIRED");
    assert.equal(r.j.ok, false);
    f.db.close();
  };
  await missing(schema);
  for (const file of readdirSync("migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    schema += "\n" + readFileSync("migrations/" + file, "utf8");
    if (!file.startsWith("0005")) await missing(schema);
  }
  for (const complete of [schema, readFileSync("schema/v2.sql", "utf8")]) {
    const f = fixture("formal", complete);
    assert.equal((await req(f, "/health")).status, 200);
    const calls = f.metrics().calls;
    assert.equal((await req(f, "/health")).status, 200);
    assert.equal(f.metrics().calls, calls);
    f.db.close();
  }
  for (const damage of [
    "DROP TABLE attendance_checks",
    "DROP TRIGGER review_time_change",
    "DROP INDEX active_employee_session",
    "UPDATE schema_meta SET version=9",
  ]) {
    const f = fixture();
    f.db.exec(damage);
    assert.equal((await req(f, "/health")).status, 503);
    f.db.close();
  }
  // A failed cached promise must not survive a repair, even within the 2s TTL.
  const f = fixture();
  f.db.exec("DROP TRIGGER review_time_change");
  assert.equal((await req(f, "/health")).status, 503);
  f.db.exec(readFileSync("schema/v2.sql", "utf8"));
  assert.equal((await req(f, "/health")).status, 200);
  f.db.close();
  mark(
    "old/partial/missing structures fail readiness; fresh and migrated databases pass without requiring a migration ledger; cache recovers",
  );
}

const f = fixture(),
  auth = await login(f),
  initialPassword = f.env.ADMIN_PASSWORD;
const firstPayload = payload("00000001");
assert.equal((await req(f, "/register", firstPayload)).status, 201);
// Populate a large legitimate roster; the review itself uses the actual API.
const original = f.db.prepare("SELECT * FROM registrations").get();
const columns = Object.keys(original);
const insert = f.db.prepare(
  `INSERT INTO registrations(${columns}) VALUES(${columns.map(() => "?")})`,
);
for (let n = 2; n <= 500; n++) {
  const employee = String(n).padStart(8, "0");
  const row = {
    ...original,
    id: randomUUID(),
    name: "合成老师 " + n,
    employee_id: employee,
    employee_hash: createHmac("sha256", f.env.APP_SECRET)
      .update("employee:" + employee)
      .digest("hex"),
    request_id: randomUUID(),
    receipt_hash: randomUUID(),
    email: employee + "@example.invalid",
  };
  insert.run(...columns.map((c) => row[c]));
}
f.db.exec(
  "UPDATE sessions SET start_at=unixepoch()-7200,end_at=unixepoch()-3600,deadline_at=unixepoch()-10800",
);
for (const outcome of ["present", "absent"]) {
  const snapshot = await req(
    f,
    "/admin/attendance-review?session=future",
    null,
    auth,
  );
  assert.equal(snapshot.status, 200);
  const result = await req(
    f,
    "/admin/attendance-review",
    {
      sessionId: "future",
      requestId: randomUUID(),
      revision: snapshot.j.revision,
      operator: "合成核对人",
      note: "合成说明 😀 ' \n".repeat(15),
      confirmed: true,
      entries: snapshot.j.people.map((p) => ({
        employeeId: p.employee_id,
        outcome,
      })),
    },
    auth,
  );
  assert.equal(result.status, 201);
  assert.equal(result.j.count, 500);
}
// Emulate data legitimately persisted by older versions: never silently sanitize it.
const legacyText = "合成\0原文 O'Neil 😀\r\n\t尾部";
f.db
  .prepare("UPDATE registrations SET name=? WHERE id=?")
  .run(legacyText, original.id);
f.db
  .prepare("UPDATE settings SET value=? WHERE key='retention'")
  .run("旧设置 😀\0'".repeat(6000));
const rotatedPassword = "synthetic-rotated-staff-password";
assert.equal(
  (
    await req(
      f,
      "/admin/password",
      { currentPassword: initialPassword, newPassword: rotatedPassword },
      auth,
    )
  ).status,
  200,
);
f.env.ADMIN_PASSWORD = rotatedPassword;
const currentAuth = await login(f);
const exported = await req(
  f,
  "/admin/backup",
  { password: rotatedPassword },
  currentAuth,
);
assert.equal(exported.status, 200);
const backup = exported.j;
assert.equal(backup.settings.admin_password_digest, undefined);
const restored = restoreSql(backup);
const longestStatement = Math.max(
  ...unstable_splitSqlQuery(restored.sql).map((s) =>
    Buffer.byteLength(s, "utf8"),
  ),
);
assert.ok(longestStatement <= 90_000);
assert.equal(
  restored.db.prepare("SELECT count(*) n FROM attendance_checks").get().n,
  500,
);
restored.db.close();
mark(
  "two real 500-person review batches and legacy NUL text produce bounded restore statements without discarding audit fields",
);

const root = resolve("work/recovery-" + randomUUID());
mkdirSync(root, { recursive: true });
const config = root + "/wrangler.json",
  persist = root + "/state";
writeFileSync(
  config,
  JSON.stringify({
    name: "mentor-recovery-test",
    compatibility_date: "2026-09-21",
    d1_databases: [
      {
        binding: "DB",
        database_name: "mentor-recovery-test",
        database_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
  }),
);
writeFileSync(root + "/restore.sql", restored.sql);
const args = [
  resolve("node_modules/wrangler/bin/wrangler.js"),
  "d1",
  "execute",
  "mentor-recovery-test",
  "--config",
  config,
  "--local",
  "--persist-to",
  persist,
  "--file",
  root + "/restore.sql",
  "--json",
];
const result = JSON.parse(
  execFileSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 20_000_000,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
    stdio: ["pipe", "pipe", "pipe"],
  }),
);
assert.ok(result.every((r) => r.success));
const proxy = await getPlatformProxy({
  configPath: config,
  persist: { path: persist + "/v3" },
  remoteBindings: false,
  envFiles: [],
});
try {
  const DB = proxy.env.DB;
  for (const table of businessTables) {
    const rows = (await DB.prepare("SELECT * FROM " + table).all()).results;
    assert.equal(rows.length, backup[table].length);
    const pk = table === "attendance_revisions" ? "session_id" : "id";
    const map = new Map(rows.map((r) => [r[pk], r]));
    for (const row of backup[table])
      for (const [key, value] of Object.entries(row))
        assert.equal(map.get(row[pk])[key], value, table + "." + key);
  }
  assert.equal(
    (
      await DB.prepare(
        "SELECT value FROM settings WHERE key='retention'",
      ).first()
    ).value,
    backup.settings.retention,
  );
  assert.equal(
    (await DB.prepare("PRAGMA foreign_key_check").all()).results.length,
    0,
  );
  assert.equal(
    (
      await DB.prepare(
        "SELECT name FROM sqlite_master WHERE name='__restore_values'",
      ).all()
    ).results.length,
    0,
  );
  const restoredEnv = {
    env: { ...f.env, DB, ADMIN_PASSWORD: "synthetic-fresh-recovery-password" },
  };
  for (const password of [initialPassword, rotatedPassword])
    assert.equal(
      (await req(restoredEnv, "/admin/login", { password })).status,
      401,
    );
  assert.equal(
    (
      await req(restoredEnv, "/admin/login", {
        password: restoredEnv.env.ADMIN_PASSWORD,
      })
    ).status,
    200,
  );
  const { requireCurrentSchema } = await bundle("worker/schemaHealth.ts");
  await requireCurrentSchema(restoredEnv.env);
  const healthResult = await req(restoredEnv, "/health");
  assert.equal(healthResult.status, 200, JSON.stringify(healthResult.j));
  const mine = await req(restoredEnv, "/mine", {
    receipts: [firstPayload.receipt],
  });
  assert.equal(mine.status, 200);
  assert.equal(mine.j.registrations[0].name, legacyText);
  mark(
    "actual local D1 import preserves every business field, NUL, multi-byte chunks, leading zeros, large settings and receipts; fresh staff password works and both old passwords fail",
  );
} finally {
  await proxy.dispose();
  f.db.close();
}
console.log("Recovery regression suite complete; no remote database used.");
