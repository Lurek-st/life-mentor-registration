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
  // Encode once as UTF-8, then split bytes. This preserves NUL, quotes and
  // multibyte text without putting control characters into SQL source.
  const quote = (v) => {
    if (v === null) return "NULL";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string")
      return "CAST(X'" + Buffer.from(v, "utf8").toString("hex") + "' AS TEXT)";
    throw Error("Invalid backup value type");
  };
  let sql =
    schema +
    "\nINSERT INTO edit_guards(scope,expected,actual) SELECT 'restore_empty','0',CAST((SELECT count(*) FROM audit)+(SELECT count(*) FROM admin_sessions)+(SELECT count(*) FROM sessions)+(SELECT count(*) FROM registrations)+(SELECT count(*) FROM rounds)+(SELECT count(*) FROM attendance_records)+(SELECT count(*) FROM attendance_checks)+(SELECT count(*) FROM attendance_batches)+(SELECT count(*) FROM attendance_revisions) AS TEXT);\nDELETE FROM edit_guards WHERE scope='restore_empty';\nDROP TRIGGER registration_gate_v2;\nDROP TRIGGER attendance_gate;\n";
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'review_%'",
    )
    .all())
    sql += "DROP TRIGGER " + name + ";\n";
  sql +=
    "CREATE TABLE __restore_values(id INTEGER PRIMARY KEY,value BLOB NOT NULL);\n";
  const append = (statement) => {
    // D1 allows 100,000 bytes per statement; leave room below that ceiling.
    if (Buffer.byteLength(statement, "utf8") > 90_000)
      throw Error("Restore statement exceeds safe D1 size");
    sql += statement + "\n";
  };
  const writeValues = (values, makeStatement) => {
    const expressions = values.map(quote);
    const largestFirst = values
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => typeof value === "string")
      .sort(
        (a, b) => expressions[b.index].length - expressions[a.index].length,
      );
    while (Buffer.byteLength(makeStatement(expressions), "utf8") > 90_000) {
      const next = largestFirst.shift();
      if (!next) throw Error("Restore row cannot fit D1 statement limit");
      const { value, index } = next;
      const bytes = Buffer.from(value, "utf8");
      append(`INSERT INTO __restore_values VALUES(${index},X'');`);
      for (let start = 0; start < bytes.length; start += 32_768) {
        const chunk = bytes.subarray(start, start + 32_768).toString("hex");
        append(
          `UPDATE __restore_values SET value=CAST(value || X'${chunk}' AS BLOB) WHERE id=${index};`,
        );
      }
      expressions[index] =
        `CAST((SELECT value FROM __restore_values WHERE id=${index}) AS TEXT)`;
    }
    // Only insert the complete business row, preserving CHECK/FK/trigger behavior.
    append(makeStatement(expressions));
    append("DELETE FROM __restore_values;");
  };
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
      writeValues(
        columns.map((c) => row[c]),
        (values) =>
          "INSERT INTO " +
          t +
          "(" +
          columns.join(",") +
          ") VALUES (" +
          values.join(",") +
          ");",
      );
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
      writeValues(
        [backup.settings[key]],
        ([value]) =>
          "UPDATE settings SET value=" +
          value +
          " WHERE key=" +
          quote(key) +
          ";",
      );
  sql += "DROP TABLE __restore_values;\n";
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
