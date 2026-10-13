import {
  EMPLOYEE_ERROR,
  SCHOOL_EMAIL_ERROR,
  validEmployeeNumber,
  validSchoolEmail,
} from "../shared/formInputs";
import { normalizeEmployee } from "../shared/model";
import { normaliseEmail, validEmail } from "../shared/email";
import type { Session, EventState, AgendaItem } from "../shared/model";
export type Row = Record<string, any>;
export interface Result {
  results: Row[];
  meta: { changes: number };
}
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<Result>;
}
export interface Env {
  DB: {
    prepare(sql: string): Statement;
    batch(stmts: Statement[]): Promise<Result[]>;
  };
  ASSETS: { fetch(r: Request): Promise<Response> };
  APP_MODE: string;
  APP_SECRET: string;
  ADMIN_PASSWORD: string;
  DATA_SPACE?: string;
  CANONICAL_ORIGIN?: string;
}
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
const publicKeys = [
  "max_sessions",
  "self_cancel",
  "registration_open",
  "contact",
  "retention",
  "version",
];
const enc = new TextEncoder();
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Row = {},
  ) {
    super(message);
  }
}
export function fail(
  status: number,
  code: string,
  message: string,
  details: Row = {},
): never {
  throw new HttpError(status, code, message, details);
}
export function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export const digest = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
export async function hmac(value: string, key: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(value)));
}
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
export function str(value: unknown, max = 200, optional = false) {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > max
  )
    fail(400, "INVALID_FIELD", "请检查必填内容和文字长度。");
  return value.trim();
}
export function integer(value: unknown, min = 0, max = 100000) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(400, "INVALID_NUMBER", "请检查数字范围。");
  return value;
}
export async function body(r: Request): Promise<Row> {
  if (!r.headers.get("Content-Type")?.includes("application/json"))
    fail(415, "JSON_REQUIRED", "请从报名页面提交。");
  const reader = r.body?.getReader();
  if (!reader) fail(400, "INVALID_JSON", "提交内容为空。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    size += x.value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      fail(413, "TOO_LARGE", "提交内容过长。");
    }
    chunks.push(x.value);
  }
  try {
    const bytes = new Uint8Array(size);
    let p = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, p);
      p += chunk.length;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error();
    return value;
  } catch {
    fail(400, "INVALID_JSON", "提交内容无法识别。");
  }
}
export async function settings(e: Env) {
  const { results } = await e.DB.prepare(
    `SELECT key,value FROM settings WHERE key IN (${publicKeys.map(() => "?").join(",")})`,
  )
    .bind(...publicKeys)
    .all();
  return Object.fromEntries(results.map((x) => [x.key, String(x.value)]));
}
export function session(row: Row): Session {
  const { subjects, agenda, booked_count, ...s } = row;
  const now = Math.floor(Date.now() / 1000);
  return {
    ...s,
    subjects: typeof subjects === "string" ? JSON.parse(subjects) : subjects,
    agenda: typeof agenda === "string" ? JSON.parse(agenda) : agenda,
    booked: booked_count,
    remaining: Math.max(0, s.capacity - booked_count),
    over_capacity: Math.max(0, booked_count - s.capacity),
    status:
      s.state === "published"
        ? s.deadline_at <= now
          ? "closed"
          : booked_count >= s.capacity
            ? "full"
            : "open"
        : s.state,
  } as Session;
}
export async function allSessions(e: Env, staff = false) {
  const { results } = await e.DB.prepare(
    `SELECT * FROM sessions ${staff ? "" : "WHERE state NOT IN ('draft','archived')"} ORDER BY start_at,sort_order,id`,
  ).all();
  return results.map(session);
}
export async function getSession(e: Env, id: string) {
  const s = await e.DB.prepare("SELECT * FROM sessions WHERE id=?")
    .bind(id)
    .first();
  if (!s) fail(404, "SESSION_NOT_FOUND", "这场活动不存在或已撤下。");
  return s;
}
export function snapshot(s: Row) {
  return JSON.stringify({
    title: s.title,
    venue: s.venue,
    start_at: s.start_at,
    end_at: s.end_at,
  });
}
export function sqlError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const text = String(error);
  const messages: Record<string, string> = {
    EDIT_CONFLICT: "设置已被其他工作人员更新，请刷新后再保存。",
    REGISTRATION_CLOSED: "报名入口已暂停，请稍后再试。",
    SESSION_UNAVAILABLE: "这场活动当前不能报名。",
    DEADLINE_PASSED: "本场已截止报名。",
    SESSION_CHANGED: "场次安排已更新，请核对最新日期、时间和内容后再提交。",
    SESSION_FULL: "本场已报满，请选择其他场次。",
    PERSON_LIMIT: "已达到每人可报场数上限。",
    STAFF_REGISTRATION_INVALID:
      "活动已结束或补录说明不完整。已到场的老师请使用参会补记。",
    ATTENDANCE_TOO_EARLY: "活动尚未开始，不能提前确认实际到场；请使用补报名。",
    ATTENDANCE_CONFIRMATION_REQUIRED: "请填写确认人及到场确认依据。",
    "attendance_records.session_id, attendance_records.employee_hash":
      "该工号已有本场的有效参会补记，请先核对或更正原记录。",
    "registrations.session_id, registrations.employee_hash":
      "该工号已报名本场。请在“我的报名”查看，或联系工作人员协助核对。",
  };
  for (const [code, message] of Object.entries(messages))
    if (text.includes(code))
      fail(
        409,
        code.includes("registrations.")
          ? "DUPLICATE_REGISTRATION"
          : code.includes("attendance_records.")
            ? "DUPLICATE_ATTENDANCE"
            : code,
        message,
      );
  throw error;
}
export async function throttle(e: Env, key: string, limit: number) {
  const now = Math.floor(Date.now() / 1000);
  const k = await hmac(key + ":" + Math.floor(now / 60), e.APP_SECRET);
  const row = await e.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
  )
    .bind(k, now + 120, limit)
    .first();
  if (!row) fail(429, "RATE_LIMIT", "操作较频繁，请稍等一分钟后再试。");
  if (Math.random() < 0.02)
    await e.DB.prepare(
      "DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 100)",
    )
      .bind(now)
      .run();
}
export function cookie(r: Request) {
  return (
    r.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("mentor_admin_v2="))
      ?.slice("mentor_admin_v2=".length) || ""
  );
}
export function setCookie(r: Request, value: string, maxAge: number) {
  return `mentor_admin_v2=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(r.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function requireAdmin(r: Request, e: Env) {
  const value = cookie(r);
  if (!/^[a-f0-9]{64}$/.test(value))
    fail(401, "AUTH_REQUIRED", "请登录工作人员后台。");
  const row = await e.DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>unixepoch()",
  )
    .bind(await digest(value))
    .first();
  if (!row) fail(401, "AUTH_REQUIRED", "登录已失效，请重新登录。");
}
export async function passwordMatches(e: Env, password: string) {
  const row = await e.DB.prepare(
    "SELECT value FROM settings WHERE key='admin_password_digest'",
  ).first();
  return row
    ? equal(String(row.value), await hmac("password:" + password, e.APP_SECRET))
    : equal(await digest(password), await digest(e.ADMIN_PASSWORD));
}
export function audit(
  e: Env,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
  conditional = false,
) {
  return e.DB.prepare(
    `INSERT INTO audit(action,target,before_json,after_json) SELECT ?,?,?,? ${conditional ? "WHERE changes()>0" : ""}`,
  ).bind(
    action,
    target,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
  );
}
export async function update(
  e: Env,
  stmt: Statement,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
) {
  const result = await e.DB.batch([
    stmt,
    audit(e, action, target, before, after, true),
  ]);
  if (!result[0].meta.changes)
    fail(
      409,
      "EDIT_CONFLICT",
      "此记录已被其他工作人员更新，请刷新后核对再保存。",
    );
}
export function profile(b: Row) {
  const name = str(b.name, 80),
    department = str(b.department, 120),
    employeeId = normalizeEmployee(str(b.employeeId, 80));
  if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(employeeId))
    fail(
      400,
      "INVALID_EMPLOYEE",
      "工号请使用字母、数字、点、横线或下划线，保留开头的0。",
    );
  return { name, department, employeeId };
}
export function emailAddress(value: unknown, optional = false) {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || /[\r\n]/.test(value))
    fail(400, "INVALID_EMAIL", "请填写一个有效的联系邮箱。");
  const email = normaliseEmail(value as string);
  if (!email && !optional)
    fail(
      400,
      "EMAIL_REQUIRED",
      "报名需要联系邮箱。请刷新页面，补充邮箱后重新提交。",
    );
  if (optional && !email) return "";
  if (!validEmail(email))
    fail(400, "INVALID_EMAIL", "请填写一个有效的联系邮箱，不要填写多个地址。");
  return email;
}
export function enforceFormalInputs(
  e: Env,
  employeeId: string | undefined,
  email: string,
) {
  if (e.APP_MODE !== "formal") return;
  if (employeeId !== undefined && !validEmployeeNumber(employeeId))
    fail(400, "INVALID_EMPLOYEE", EMPLOYEE_ERROR);
  if (email && !validSchoolEmail(email))
    fail(400, "SCHOOL_EMAIL_REQUIRED", SCHOOL_EMAIL_ERROR);
}
export function receipts(b: Row) {
  if (
    !Array.isArray(b.receipts) ||
    b.receipts.length > 100 ||
    b.receipts.some(
      (x) => typeof x !== "string" || !/^mr_[a-f0-9]{64}$/.test(x),
    )
  )
    fail(400, "INVALID_RECEIPT", "报名凭证格式不正确。");
  return b.receipts as string[];
}
export function registrationView(
  row: Row,
  s: Session,
  config: Row,
  index?: number,
) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: row.id,
    session_id: row.session_id,
    name: row.name,
    department: row.department,
    employee_id: row.employee_id,
    email: row.email || "",
    created_at: row.created_at,
    cancelled_at: row.cancelled_at,
    cancel_reason: row.cancel_reason,
    version: row.version,
    confirmed_revision: row.confirmed_revision,
    snapshot: JSON.parse(row.snapshot),
    session: s,
    content_changed: row.confirmed_revision !== s.content_version,
    can_cancel:
      !row.cancelled_at &&
      config.self_cancel === "true" &&
      ["published", "paused"].includes(s.state) &&
      (s.deadline_at > now ||
        (row.confirmed_revision !== s.content_version && s.start_at > now)),
    ...(index === undefined ? {} : { receiptIndex: index }),
  };
}
export async function owned(e: Env, b: Row) {
  const token = str(b.receipt, 100);
  if (!/^mr_[a-f0-9]{64}$/.test(token))
    fail(404, "NOT_FOUND", "找不到对应报名。");
  const row = await e.DB.prepare(
    "SELECT * FROM registrations WHERE id=? AND receipt_hash=?",
  )
    .bind(str(b.id, 80), await digest(token))
    .first();
  if (!row) fail(404, "NOT_FOUND", "找不到对应报名，请检查凭证。");
  return row;
}
export function editFields(b: Row) {
  const start = integer(b.start_at, 946684800, 7258118400),
    end = integer(b.end_at, 946684800, 7258118400),
    deadline = integer(b.deadline_at, 946684800, 7258118400);
  if (end <= start || end - start > 86400 || deadline >= start)
    fail(
      400,
      "INVALID_TIME",
      "结束时间须晚于开始，报名截止须早于开始；单场不超过24小时。",
    );
  if (!Array.isArray(b.subjects) || b.subjects.length > 20)
    fail(400, "INVALID_CONTENT", "请检查主题内容。");
  if (!Array.isArray(b.agenda) || b.agenda.length > 40)
    fail(400, "INVALID_AGENDA", "请检查场内议程。");
  const agenda: AgendaItem[] = b.agenda.map((x: Row) => ({
    offset: integer(x.offset, 0, 1440),
    minutes: integer(x.minutes, 1, 1440),
    title: str(x.title, 160),
    description: str(x.description, 3000, true),
  }));
  if (agenda.some((x) => (x.offset + x.minutes) * 60 > end - start))
    fail(
      400,
      "AGENDA_TOO_LONG",
      "议程超过活动结束时间，请调整议程或结束时间。",
    );
  if (
    !["draft", "published", "paused", "cancelled", "archived"].includes(b.state)
  )
    fail(400, "INVALID_STATE", "活动状态不正确。");
  return {
    round_id: str(b.round_id, 80),
    sort_order: integer(b.sort_order, 0, 100000),
    template_key: str(b.template_key, 80),
    title: str(b.title, 160),
    title_en: str(b.title_en, 200, true),
    subjects: JSON.stringify(b.subjects.map((x: unknown) => str(x, 200))),
    agenda: JSON.stringify(agenda),
    venue: str(b.venue, 200),
    start_at: start,
    end_at: end,
    deadline_at: deadline,
    capacity: integer(b.capacity, 1, 100000),
    state: b.state as EventState,
    change_note: str(b.change_note || "", 1000, true),
  };
}
