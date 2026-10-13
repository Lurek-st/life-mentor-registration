// Only synthetic fixtures and isolated local D1 databases. Never contacts a remote DB.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { restoreSql } from "./restore-model.mjs";

const root = resolve("work/upgrade-" + randomUUID());
mkdirSync(root, { recursive: true });
const oldSchema = readFileSync("tests/fixtures/v2/v2.sql", "utf8");
const seed = `
INSERT INTO rounds(id,title,sort_order) VALUES('r','合成测试轮次',1);
INSERT INTO sessions(id,round_id,template_key,title,title_en,subjects,agenda,venue,start_at,end_at,deadline_at,capacity,state)
VALUES('s','r','connection','交流测试','Discussion','[]','[]','示例活动室',unixepoch()+7200,unixepoch()+10800,unixepoch()+3600,36,'published');
INSERT INTO registrations(id,session_id,name,department,employee_id,employee_hash,receipt_hash,request_id,request_fingerprint,confirmed_revision,snapshot)
VALUES('reg','s','虚构测试姓名','示例部门','00000123','synthetic-employee-hash','synthetic-receipt-hash','synthetic-request-id','synthetic-fingerprint',1,'{"title":"交流测试"}');
INSERT INTO audit(action,target,before_json,after_json) VALUES('fixture','reg',NULL,'{"fixture":true}');
UPDATE settings SET value='示例组织方的保留规则' WHERE key='retention';
`;
const old = new DatabaseSync(":memory:");
old.exec(oldSchema + seed);
const legacy = {
  schemaVersion: 2,
  settings: Object.fromEntries(
    old
      .prepare("SELECT * FROM settings")
      .all()
      .map((r) => [r.key, r.value]),
  ),
};
for (const table of ["rounds", "sessions", "registrations", "audit"])
  legacy[table] = old.prepare("SELECT * FROM " + table).all();
const backupFile = root + "/legacy.json",
  sqlFile = root + "/restored.sql";
writeFileSync(backupFile, JSON.stringify(legacy));
const run = (file, args, options = {}) =>
  execFileSync(process.execPath, [file, ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
    maxBuffer: 10_000_000,
    ...options,
  });
run("scripts/prepare-restore-v2.mjs", [backupFile, sqlFile]);
const restored = new DatabaseSync(":memory:");
restored.exec(readFileSync(sqlFile, "utf8"));
for (const table of ["rounds", "sessions", "registrations", "audit"])
  for (const row of legacy[table]) {
    const got = restored
      .prepare("SELECT * FROM " + table + " WHERE id=?")
      .get(row.id);
    for (const key of Object.keys(row))
      assert.equal(got[key], row[key], table + "." + key);
  }
assert.equal(
  restored.prepare("SELECT employee_id,email,source FROM registrations").get()
    .employee_id,
  "00000123",
);
assert.equal(
  restored.prepare("SELECT email FROM registrations").get().email,
  "",
);
assert.throws(
  () => restored.exec(readFileSync(sqlFile, "utf8")),
  /EDIT_CONFLICT/,
);
console.log(
  "PASS shipped CLI restores v2 without losing Chinese, leading zeros, receipts, counts or settings; refuses occupied target",
);

for (const name of readdirSync("migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort())
  old.exec(readFileSync("migrations/" + name, "utf8"));
for (const table of ["rounds", "sessions", "registrations", "audit"])
  for (const row of legacy[table]) {
    const got = old
      .prepare("SELECT * FROM " + table + " WHERE id=?")
      .get(row.id);
    for (const key of Object.keys(row))
      assert.equal(got[key], row[key], table + "." + key);
  }
assert.equal(
  old.prepare("SELECT count(*) n FROM attendance_checks").get().n,
  0,
);
assert.equal(old.prepare("PRAGMA foreign_key_check").all().length, 0);
console.log(
  "PASS additive migrations preserve every legacy field and leave attendance unconfirmed",
);

// Exercise Wrangler's real local migration ledger, including an idempotent second apply.
const config = root + "/wrangler.json",
  persist = root + "/state";
writeFileSync(
  config,
  JSON.stringify({
    name: "mentor-upgrade-test",
    compatibility_date: "2026-09-21",
    d1_databases: [
      {
        binding: "DB",
        database_name: "mentor-upgrade-test",
        database_id: "00000000-0000-0000-0000-000000000000",
        migrations_dir: resolve("migrations"),
      },
    ],
  }),
);
writeFileSync(root + "/seed.sql", oldSchema + seed);
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const local = ["--config", config, "--local", "--persist-to", persist];
run(wrangler, [
  "d1",
  "execute",
  "mentor-upgrade-test",
  ...local,
  "--file",
  root + "/seed.sql",
  "--json",
]);
const beforeD1 = JSON.parse(
  run(wrangler, [
    "d1",
    "execute",
    "mentor-upgrade-test",
    ...local,
    "--command",
    "SELECT * FROM registrations",
    "--json",
  ]),
)[0].results[0];
run(wrangler, ["d1", "migrations", "apply", "mentor-upgrade-test", ...local]);
run(wrangler, ["d1", "migrations", "apply", "mentor-upgrade-test", ...local]);
const query = (sql) =>
  JSON.parse(
    run(wrangler, [
      "d1",
      "execute",
      "mentor-upgrade-test",
      ...local,
      "--command",
      sql,
      "--json",
    ]),
  )[0].results;
assert.equal(query("SELECT count(*) n FROM d1_migrations")[0].n, 4);
const actual = query("SELECT * FROM registrations")[0];
for (const [k, v] of Object.entries(beforeD1)) assert.equal(actual[k], v);
assert.equal(actual.email, "");
assert.equal(actual.source, "self");
assert.deepEqual(query("PRAGMA foreign_key_check"), []);
console.log(
  "PASS real local D1 upgrade, repeat-apply ledger and original registration preservation",
);

const code = await build({
  entryPoints: ["shared/backupCrypto.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { encryptBackup } = await import(
  "data:text/javascript;base64," +
    Buffer.from(code.outputFiles[0].text).toString("base64")
);
const password = "Synthetic backup phrase " + randomUUID();
writeFileSync(
  root + "/encrypted.mentor-backup",
  JSON.stringify(await encryptBackup(legacy, password)),
);
run(
  "scripts/prepare-restore-v2.mjs",
  [
    root + "/encrypted.mentor-backup",
    root + "/decrypted.sql",
    "--password-stdin",
  ],
  { input: password + "\n" },
);
assert.equal(
  readFileSync(root + "/decrypted.sql", "utf8"),
  readFileSync(sqlFile, "utf8"),
);
assert.throws(() =>
  run(
    "scripts/prepare-restore-v2.mjs",
    [root + "/encrypted.mentor-backup", root + "/bad.sql", "--password-stdin"],
    { input: "wrong\n", stdio: ["pipe", "pipe", "pipe"] },
  ),
);
console.log(
  "PASS encrypted backup through shipped CLI, matching restore SQL and wrong-password rejection",
);
restoreSql(legacy).db.close();
old.close();
restored.close();
