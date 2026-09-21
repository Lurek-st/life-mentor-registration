import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: node scripts/prepare-restore-v2.mjs <private-backup.json> <new-empty-database.sql>",
  );
if (resolve(input) === resolve(output))
  throw Error("Input and output must differ.");
const backup = JSON.parse(readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
if (backup.schemaVersion !== 2)
  throw Error("Only schemaVersion2 is supported.");
const schema = readFileSync("schema/v2.sql", "utf8"),
  db = new DatabaseSync(":memory:");
db.exec(schema);
const quote = (value) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : (() => {
            throw Error("Invalid number");
          })()
      : "'" + String(value).replaceAll("'", "''") + "'";
let sql =
  schema +
  "\nINSERT INTO edit_guards(scope,expected,actual) SELECT 'restore_empty','0',CAST((SELECT count(*) FROM sessions)+(SELECT count(*) FROM registrations)+(SELECT count(*) FROM rounds) AS TEXT);\nDELETE FROM edit_guards WHERE scope='restore_empty';\nDROP TRIGGER registration_gate_v2;\n";
for (const table of ["rounds", "sessions", "registrations", "audit"]) {
  if (!Array.isArray(backup[table]))
    throw Error("Missing backup table " + table);
  const columns = db
    .prepare("PRAGMA table_info(" + table + ")")
    .all()
    .map((c) => c.name);
  for (const source of backup[table]) {
    const row = {
      ...source,
      ...(table === "sessions" ? { booked_count: 0 } : {}),
    };
    if (columns.some((c) => !(c in row)))
      throw Error("Incomplete row in " + table);
    sql +=
      "INSERT INTO " +
      table +
      "(" +
      columns.join(",") +
      ") VALUES (" +
      columns.map((c) => quote(row[c])).join(",") +
      ");\n";
  }
}
for (const key of [
  "max_sessions",
  "self_cancel",
  "registration_open",
  "contact",
  "retention",
  "version",
])
  if (typeof backup.settings?.[key] === "string")
    sql +=
      "UPDATE settings SET value=" +
      quote(backup.settings[key]) +
      " WHERE key=" +
      quote(key) +
      ";\n";
sql += "\n" + schema;
db.exec(sql);
if (
  db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
  db.prepare("PRAGMA foreign_key_check").all().length
)
  throw Error("Restored integrity check failed");
for (const s of backup.sessions)
  if (
    db.prepare("SELECT booked_count FROM sessions WHERE id=?").get(s.id)
      .booked_count !== s.booked_count
  )
    throw Error("Restored registration count does not match snapshot");
db.close();
writeFileSync(output, sql);
console.log(
  "Prepared and validated empty-database restore SQL. Contains personal data; keep private. No cloud data changed.",
);
