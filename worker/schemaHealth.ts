import { fail, type Env } from "./core";
// Actual structure, not d1_migrations: fresh installations and restores have no migration ledger.
const requiredTables: Record<string, string[]> = {
  admin_sessions: ["token_hash", "expires_at", "created_at"],
  attendance_batches: [
    "id",
    "session_id",
    "fingerprint",
    "operator",
    "note",
    "count",
    "created_at",
  ],
  attendance_checks: [
    "id",
    "session_id",
    "employee_id",
    "name",
    "department",
    "email",
    "outcome",
    "basis_json",
    "session_start",
    "session_end",
    "operator",
    "note",
    "checked_at",
    "batch_id",
    "version",
  ],
  attendance_records: [
    "id",
    "session_id",
    "name",
    "department",
    "employee_id",
    "employee_hash",
    "email",
    "confirmed_by",
    "confirmation_note",
    "request_id",
    "request_fingerprint",
    "version",
    "created_at",
    "updated_at",
    "cancelled_at",
    "cancel_reason",
  ],
  attendance_revisions: ["session_id", "revision", "time_changed_at"],
  audit: ["id", "action", "target", "before_json", "after_json", "created_at"],
  edit_guards: ["scope", "expected", "actual"],
  rate_limits: ["key", "count", "expires_at"],
  registrations: [
    "id",
    "session_id",
    "name",
    "department",
    "email",
    "employee_id",
    "employee_hash",
    "receipt_hash",
    "request_id",
    "request_fingerprint",
    "confirmed_revision",
    "snapshot",
    "version",
    "created_at",
    "cancelled_at",
    "cancel_reason",
    "source",
    "recorded_by",
    "staff_note",
  ],
  rounds: ["id", "title", "sort_order", "version"],
  schema_meta: ["version"],
  sessions: [
    "id",
    "round_id",
    "sort_order",
    "template_key",
    "title",
    "title_en",
    "subjects",
    "agenda",
    "venue",
    "start_at",
    "end_at",
    "deadline_at",
    "capacity",
    "state",
    "version",
    "content_version",
    "booked_count",
    "change_note",
    "updated_at",
  ],
  settings: ["key", "value"],
};
const requiredObjects = [
  "index:active_attendance_employee_session",
  "index:active_employee_session",
  "index:attendance_batches_session",
  "index:attendance_checks_session",
  "index:attendance_session_created",
  "index:person_active_v2",
  "index:rate_limits_expiry",
  "index:receipt_lookup_v2",
  "index:session_registrations_v2",
  "trigger:attendance_gate",
  "trigger:attendance_no_move",
  "trigger:attendance_no_reactivate",
  "trigger:edit_guard_check",
  "trigger:registration_count_cancel",
  "trigger:registration_count_insert",
  "trigger:registration_edit_limit_v2",
  "trigger:registration_gate_v2",
  "trigger:registration_no_move_v2",
  "trigger:registration_no_reactivate_v2",
  "trigger:review_attendance_checks_delete",
  "trigger:review_attendance_checks_insert",
  "trigger:review_attendance_checks_update",
  "trigger:review_attendance_records_delete",
  "trigger:review_attendance_records_insert",
  "trigger:review_attendance_records_update",
  "trigger:review_registrations_delete",
  "trigger:review_registrations_insert",
  "trigger:review_registrations_update",
  "trigger:review_session_update",
  "trigger:review_time_change",
];
const tables = Object.entries(requiredTables);
const columnProbe =
  "SELECT " +
  tables
    .map(
      ([, columns], i) =>
        "(" +
        columns.map((column) => `t${i}.${column} IS NULL`).join(" OR ") +
        ")",
    )
    .join(",") +
  " FROM " +
  tables.map(([table], i) => `${table} t${i}`).join(",") +
  " LIMIT 0";
export async function requireCurrentSchema(e: Env) {
  const upgrade = () =>
    fail(503, "DB_UPGRADE_REQUIRED", "数据库需要完成升级，请联系维护人员。", {
      ok: false,
    });
  const { results } = await e.DB.prepare(
    "SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
  ).all();
  const found = new Set(results.map((row) => row.type + ":" + row.name));
  if (
    tables.some(([name]) => !found.has("table:" + name)) ||
    requiredObjects.some((name) => !found.has(name))
  )
    upgrade();
  // A zero-row SELECT verifies actual columns without reading any business data.
  // D1 does not authorize SQLite table-valued PRAGMA functions.
  try {
    await e.DB.prepare(columnProbe).all();
  } catch (error) {
    if (
      /no such (column|table)/i.test(
        error instanceof Error ? error.message : String(error),
      )
    )
      upgrade();
    throw error;
  }
}
