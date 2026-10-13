import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
export const businessTables = [
  "rounds",
  "sessions",
  "registrations",
  "audit",
  "attendance_records",
  "attendance_batches",
  "attendance_checks",
  "attendance_revisions",
];
export function restoreSql(source) {
  const backup = structuredClone(source);
  if (backup.schemaVersion !== 2) throw Error("Unsupported schema version");
  if (
    backup.manualRecordsVersion !== undefined &&
    backup.manualRecordsVersion !== 1
  )
    throw Error("Unsupported manual records version");
  if (backup.attendance_records === undefined) {
    if (backup.manualRecordsVersion === 1)
      throw Error("Missing attendance records");
    backup.attendance_records = [];
  }
  if (
    backup.attendanceChecksVersion !== undefined &&
    backup.attendanceChecksVersion !== 1
  )
    throw Error("Unsupported attendance checks version");
  for (const t of businessTables.slice(5)) {
    if (backup[t] === undefined) {
      if (backup.attendanceChecksVersion === 1)
        throw Error("Missing attendance table");
      backup[t] = [];
    }
  }
  const schema = readFileSync("schema/v2.sql", "utf8"),
    db = new DatabaseSync(":memory:");
  db.exec(schema);
  const quote = (v) =>
    v === null
      ? "NULL"
      : typeof v === "number"
        ? Number.isFinite(v)
          ? String(v)
          : (() => {
              throw Error("Invalid number");
            })()
        : "'" + String(v).replaceAll("'", "''") + "'";
  let sql =
    schema +
    "\nINSERT INTO edit_guards(scope,expected,actual) SELECT 'restore_empty','0',CAST((SELECT count(*) FROM sessions)+(SELECT count(*) FROM registrations)+(SELECT count(*) FROM rounds)+(SELECT count(*) FROM attendance_records)+(SELECT count(*) FROM attendance_checks)+(SELECT count(*) FROM attendance_batches)+(SELECT count(*) FROM attendance_revisions) AS TEXT);\nDELETE FROM edit_guards WHERE scope='restore_empty';\nDROP TRIGGER registration_gate_v2;\nDROP TRIGGER attendance_gate;\n";
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'review_%'",
    )
    .all())
    sql += "DROP TRIGGER " + name + ";\n";
  for (const t of businessTables) {
    if (!Array.isArray(backup[t])) throw Error("Missing backup table");
    const columns = db
      .prepare("PRAGMA table_info(" + t + ")")
      .all()
      .map((x) => x.name);
    for (const original of backup[t]) {
      const row = {
        ...(t === "registrations"
          ? { email: "", source: "self", recorded_by: "", staff_note: "" }
          : {}),
        ...original,
        ...(t === "sessions" ? { booked_count: 0 } : {}),
      };
      if (columns.some((c) => !(c in row)))
        throw Error("Incomplete backup row");
      sql +=
        "INSERT INTO " +
        t +
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
    throw Error("Restore integrity failed");
  for (const t of businessTables)
    for (const row of backup[t]) {
      const pk = t === "attendance_revisions" ? "session_id" : "id",
        restored = db
          .prepare("SELECT * FROM " + t + " WHERE " + pk + "=?")
          .get(row[pk]);
      for (const [k, v] of Object.entries(row))
        if (restored[k] !== v)
          throw Error("Restored field mismatch in " + t + "." + k);
    }
  return { sql, db, backup };
}
