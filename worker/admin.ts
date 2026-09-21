import { templates } from "../shared/model";
import {
  type Env,
  type Row,
  fail,
  json,
  body,
  str,
  integer,
  settings,
  allSessions,
  getSession,
  session,
  editFields,
  update,
  audit,
  profile,
  hmac,
  passwordMatches,
  setCookie,
} from "./core";
const safeRecord = (x: Row) => ({
  id: x.id,
  session_id: x.session_id,
  name: x.name,
  department: x.department,
  employee_id: x.employee_id,
  version: x.version,
  cancelled_at: x.cancelled_at,
  cancel_reason: x.cancel_reason,
});
export async function admin(r: Request, e: Env, url: URL): Promise<Response> {
  const p = url.pathname,
    m = r.method;
  if (p === "/api/admin/state" && m === "GET") {
    const [sessions, rounds, config] = await Promise.all([
      allSessions(e, true),
      e.DB.prepare("SELECT * FROM rounds ORDER BY sort_order,id").all(),
      settings(e),
    ]);
    return json({
      sessions,
      rounds: rounds.results,
      settings: config,
      templates,
      mode: e.APP_MODE,
    });
  }
  if (p === "/api/admin/sessions" && m === "POST") {
    const b = await body(r),
      v = editFields(b);
    await roundExists(e, v.round_id);
    const id = crypto.randomUUID();
    await e.DB.batch([
      e.DB.prepare(
        `INSERT INTO sessions(id,${Object.keys(v).join(",")}) VALUES (${[id, ...Object.values(v)].map(() => "?").join(",")})`,
      ).bind(id, ...Object.values(v)),
      audit(e, "session.create", id, null, v),
    ]);
    return json({ session: session(await getSession(e, id)) }, 201);
  }
  const sessionMatch = p.match(/^\/api\/admin\/sessions\/([^/]+)$/);
  if (sessionMatch && m === "PATCH") {
    const id = sessionMatch[1],
      b = await body(r),
      before = await getSession(e, id),
      version = integer(b.version, 1),
      v = editFields(b);
    await roundExists(e, v.round_id);
    if (before.version !== version)
      fail(409, "EDIT_CONFLICT", "这场活动已被更新，请刷新后核对再保存。");
    const material = [
      "title",
      "title_en",
      "subjects",
      "agenda",
      "venue",
      "start_at",
      "end_at",
    ].some((k) => before[k] !== v[k as keyof typeof v]);
    const impact =
      before.booked_count > 0 &&
      (material ||
        v.capacity < before.booked_count ||
        (["draft", "cancelled", "archived"].includes(v.state) &&
          before.state !== v.state) ||
        (["draft", "cancelled", "archived"].includes(before.state) &&
          before.state !== v.state));
    if (impact && b.ackImpact !== true)
      fail(
        409,
        "IMPACT_CONFIRM",
        "本次修改影响已有报名，请核对影响人数后确认。",
        { affected: before.booked_count },
      );
    if (b.ackImpact === true && b.expectedBooked !== before.booked_count)
      fail(
        409,
        "IMPACT_STALE",
        "已有报名人数发生变化，请刷新后核对影响人数。",
        { affected: before.booked_count },
      );
    const after = {
      ...v,
      version: version + 1,
      content_version: before.content_version + (material ? 1 : 0),
    };
    await update(
      e,
      e.DB.prepare(
        `UPDATE sessions SET ${Object.keys(v)
          .map((k) => k + "=?")
          .join(
            ",",
          )},version=version+1,content_version=content_version+?,updated_at=unixepoch() WHERE id=? AND version=? AND booked_count=?`,
      ).bind(
        ...Object.values(v),
        material ? 1 : 0,
        id,
        version,
        before.booked_count,
      ),
      "session.update",
      id,
      before,
      after,
    );
    return json({
      session: session(await getSession(e, id)),
      affected: before.booked_count,
      needsNotice: impact,
    });
  }
  if (p === "/api/admin/rounds" && m === "POST") {
    const b = await body(r),
      id = crypto.randomUUID(),
      v = { title: str(b.title, 120), sort_order: integer(b.sort_order) };
    await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO rounds(id,title,sort_order) VALUES (?,?,?)",
      ).bind(id, v.title, v.sort_order),
      audit(e, "round.create", id, null, v),
    ]);
    return json({ id }, 201);
  }
  const roundMatch = p.match(/^\/api\/admin\/rounds\/([^/]+)$/);
  if (roundMatch && m === "PATCH") {
    const b = await body(r),
      id = roundMatch[1],
      old = await e.DB.prepare("SELECT * FROM rounds WHERE id=?")
        .bind(id)
        .first();
    if (!old) fail(404, "NOT_FOUND", "轮次不存在。");
    const v = { title: str(b.title, 120), sort_order: integer(b.sort_order) };
    await update(
      e,
      e.DB.prepare(
        "UPDATE rounds SET title=?,sort_order=?,version=version+1 WHERE id=? AND version=?",
      ).bind(v.title, v.sort_order, id, integer(b.version, 1)),
      "round.update",
      id,
      old,
      v,
    );
    return json({ ok: true });
  }
  if (p === "/api/admin/settings" && m === "PATCH") {
    const b = await body(r),
      before = await settings(e),
      version = String(integer(b.version, 1)),
      v = {
        max_sessions: String(integer(b.max_sessions, 0, 100000)),
        self_cancel: b.self_cancel === true ? "true" : "false",
        registration_open: b.registration_open === true ? "true" : "false",
        contact: str(b.contact, 1000),
        retention: str(b.retention, 3000),
        version: String(Number(version) + 1),
      };
    await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO edit_guards(scope,expected,actual) SELECT 'settings',?,value FROM settings WHERE key='version'",
      ).bind(version),
      ...Object.entries(v).map(([k, val]) =>
        e.DB.prepare("UPDATE settings SET value=? WHERE key=?").bind(val, k),
      ),
      audit(e, "settings.update", "settings", before, v),
      e.DB.prepare("DELETE FROM edit_guards WHERE scope='settings'"),
    ]);
    return json({ settings: await settings(e) });
  }
  if (p === "/api/admin/password" && m === "POST") {
    const b = await body(r),
      next = str(b.newPassword, 300);
    if (next.length < 16)
      fail(
        400,
        "WEAK_PASSWORD",
        "新口令至少16个字符，可使用一句容易记住的话。",
      );
    if (!(await passwordMatches(e, str(b.currentPassword, 300))))
      fail(401, "BAD_PASSWORD", "当前口令不正确。");
    await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO settings(key,value) VALUES ('admin_password_digest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).bind(await hmac("password:" + next, e.APP_SECRET)),
      e.DB.prepare("DELETE FROM admin_sessions"),
      audit(e, "password.change", "admin", null, { allSessionsRevoked: true }),
    ]);
    return json({ ok: true }, 200, { "Set-Cookie": setCookie(r, "", 0) });
  }
  if (
    ["/api/admin/registrations", "/api/admin/export-data"].includes(p) &&
    m === "GET"
  ) {
    const clauses: string[] = [],
      args: unknown[] = [];
    const sid = url.searchParams.get("session"),
      q = url.searchParams.get("q")?.trim(),
      state = url.searchParams.get("state") || "active";
    if (sid) {
      clauses.push("r.session_id=?");
      args.push(sid);
    }
    if (q) {
      if (q.length > 120) fail(400, "QUERY_TOO_LONG", "搜索文字过长。");
      clauses.push(
        "(r.name LIKE ? ESCAPE '!' OR r.department LIKE ? ESCAPE '!' OR r.employee_id LIKE ? ESCAPE '!')",
      );
      const term = "%" + q.replace(/[!%_]/g, "!$&") + "%";
      args.push(term, term, term);
    }
    if (state === "active") clauses.push("r.cancelled_at IS NULL");
    else if (state === "cancelled") clauses.push("r.cancelled_at IS NOT NULL");
    else if (state !== "all") fail(400, "INVALID_STATE", "名单状态无效。");
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "",
      count = await e.DB.prepare(
        `SELECT count(*) AS n FROM registrations r ${where}`,
      )
        .bind(...args)
        .first();
    const exporting = p.endsWith("export-data"),
      page = Math.max(1, Number(url.searchParams.get("page") || 1));
    if (!Number.isSafeInteger(page)) fail(400, "INVALID_PAGE", "页码无效。");
    if (exporting && count!.n > 20000)
      fail(400, "EXPORT_TOO_LARGE", "请按场次筛选后分批导出。");
    const { results } = await e.DB.prepare(
      `SELECT r.id,r.session_id,r.name,r.department,r.employee_id,r.created_at,r.cancelled_at,r.cancel_reason,r.version,s.title AS session_title,s.start_at,s.end_at,s.venue,s.state AS event_state FROM registrations r JOIN sessions s ON s.id=r.session_id ${where} ORDER BY s.start_at,r.created_at,r.id LIMIT ? OFFSET ?`,
    )
      .bind(...args, exporting ? 20000 : 50, exporting ? 0 : (page - 1) * 50)
      .all();
    return json({ records: results, total: count!.n, page, pageSize: 50 });
  }
  const recordMatch = p.match(
    /^\/api\/admin\/registrations\/([^/]+)(\/cancel)?$/,
  );
  if (recordMatch && ["PATCH", "POST"].includes(m)) {
    const id = recordMatch[1],
      b = await body(r),
      before = await e.DB.prepare("SELECT * FROM registrations WHERE id=?")
        .bind(id)
        .first();
    if (!before) fail(404, "NOT_FOUND", "报名记录不存在。");
    const version = integer(b.version, 1);
    if (recordMatch[2] && m === "POST") {
      const reason = str(b.reason, 500);
      await update(
        e,
        e.DB.prepare(
          "UPDATE registrations SET cancelled_at=COALESCE(cancelled_at,unixepoch()),cancel_reason=?,version=version+1 WHERE id=? AND version=?",
        ).bind(reason, id, version),
        "registration.cancel",
        id,
        safeRecord(before),
        { reason },
      );
      return json({ ok: true });
    }
    if (!recordMatch[2] && m === "PATCH") {
      const v = profile(b),
        hash = await hmac("employee:" + v.employeeId, e.APP_SECRET);
      await update(
        e,
        e.DB.prepare(
          "UPDATE registrations SET name=?,department=?,employee_id=?,employee_hash=?,version=version+1 WHERE id=? AND version=?",
        ).bind(v.name, v.department, v.employeeId, hash, id, version),
        "registration.correct",
        id,
        safeRecord(before),
        v,
      );
      return json({ ok: true });
    }
  }
  if (p === "/api/admin/audit" && m === "GET") {
    const target = url.searchParams.get("target");
    const { results } = await e.DB.prepare(
      `SELECT * FROM audit ${target ? "WHERE target=?" : ""} ORDER BY id DESC LIMIT 100`,
    )
      .bind(...(target ? [target] : []))
      .all();
    return json({
      records: results.map((x) => ({
        ...x,
        before: x.before_json ? JSON.parse(x.before_json) : null,
        after: x.after_json ? JSON.parse(x.after_json) : null,
        before_json: undefined,
        after_json: undefined,
      })),
    });
  }
  if (p === "/api/admin/backup" && m === "GET") {
    const tables = ["rounds", "sessions", "registrations", "audit"];
    const data = await e.DB.batch([
      ...tables.map((t) => e.DB.prepare(`SELECT * FROM ${t}`)),
      e.DB.prepare(
        "SELECT key,value FROM settings WHERE key!='admin_password_digest'",
      ),
    ]);
    return json(
      {
        schemaVersion: 2,
        mode: e.APP_MODE,
        exportedAt: new Date().toISOString(),
        settings: Object.fromEntries(
          data[4].results.map((x) => [x.key, x.value]),
        ),
        ...Object.fromEntries(tables.map((t, i) => [t, data[i].results])),
      },
      200,
      { "Content-Disposition": 'attachment; filename="mentor-backup.json"' },
    );
  }
  fail(404, "NOT_FOUND", "没有找到这个后台操作。");
}
async function roundExists(e: Env, id: string) {
  if (
    !(await e.DB.prepare("SELECT id FROM rounds WHERE id=?").bind(id).first())
  )
    fail(400, "ROUND_NOT_FOUND", "请选择存在的轮次。");
}
