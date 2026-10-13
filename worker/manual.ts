import {
  type Env,
  type Row,
  body,
  profile,
  emailAddress,
  enforceFormalInputs,
  str,
  integer,
  fail,
  json,
  hmac,
  digest,
  randomToken,
  getSession,
  snapshot,
  audit,
  update,
  sqlError,
} from "./core";

// Called only from the authenticated admin router. Public registration never accepts a source override.
export async function manual(
  r: Request,
  e: Env,
  url: URL,
): Promise<Response | null> {
  const p = url.pathname,
    m = r.method;
  if (
    m === "POST" &&
    ["/api/admin/registrations", "/api/admin/attendance"].includes(p)
  ) {
    const attendance = p.endsWith("/attendance"),
      b = await body(r),
      v = profile(b);
    if (e.APP_MODE !== "formal" && !v.employeeId.startsWith("TEST-"))
      fail(400, "TEST_ONLY", "测试环境请使用 TEST- 开头的虚构工号。");
    const email = emailAddress(b.email, attendance),
      sid = str(b.sessionId, 80),
      requestId = str(b.requestId, 40);
    const operator = str(b.operator, 80),
      note = str(b.note, 500),
      version = integer(b.sessionVersion, 1);
    if (!/^[a-f0-9-]{36}$/.test(requestId) || b.confirmed !== true)
      fail(
        400,
        "CONFIRM_REQUIRED",
        "请核对场次、人员信息及登记类型，并勾选确认。",
      );
    const table = attendance ? "attendance_records" : "registrations";
    const fingerprint = await hmac(
      JSON.stringify([
        attendance ? "attendance" : "staff",
        sid,
        v.name,
        v.department,
        v.employeeId,
        email,
        operator,
        note,
        version,
      ]),
      e.APP_SECRET,
    );
    const replay = async () => {
      const prior = await e.DB.prepare(
        `SELECT id,request_fingerprint,cancelled_at FROM ${table} WHERE request_id=?`,
      )
        .bind(requestId)
        .first();
      if (!prior) return null;
      if (prior.request_fingerprint !== fingerprint)
        fail(
          409,
          "REQUEST_CONFLICT",
          "本次提交内容已改变，请重新打开补录表单后核对。",
        );
      return json({
        id: prior.id,
        replayed: true,
        cancelled: prior.cancelled_at !== null,
      });
    };
    const prior = await replay();
    if (prior) return prior;
    enforceFormalInputs(e, v.employeeId, email);
    const s = await getSession(e, sid);
    if (s.version !== version)
      fail(
        409,
        "SESSION_CHANGED",
        "场次已被修改，请关闭表单并刷新后台，再重新核对。",
      );
    if (
      !(
        attendance
          ? ["published", "paused", "archived"]
          : ["published", "paused"]
      ).includes(s.state)
    )
      fail(
        409,
        "SESSION_UNAVAILABLE",
        "请先核对活动状态，取消或草稿活动不能补录。",
      );
    const now = Math.floor(Date.now() / 1000);
    if (attendance && s.start_at > now)
      fail(
        409,
        "ATTENDANCE_TOO_EARLY",
        "活动尚未开始，不能提前确认实际到场；请使用补报名。",
      );
    if (!attendance && s.end_at <= now)
      fail(
        409,
        "STAFF_REGISTRATION_INVALID",
        "活动已结束；已确认到场的老师请使用参会补记。",
      );
    const id = crypto.randomUUID(),
      employeeHash = await hmac("employee:" + v.employeeId, e.APP_SECRET);
    const fields = attendance
      ? {
          id,
          session_id: sid,
          name: v.name,
          department: v.department,
          employee_id: v.employeeId,
          employee_hash: employeeHash,
          email,
          confirmed_by: operator,
          confirmation_note: note,
          request_id: requestId,
          request_fingerprint: fingerprint,
        }
      : {
          id,
          session_id: sid,
          name: v.name,
          department: v.department,
          employee_id: v.employeeId,
          employee_hash: employeeHash,
          email,
          receipt_hash: await digest(randomToken()),
          request_id: requestId,
          request_fingerprint: fingerprint,
          confirmed_revision: s.content_version,
          snapshot: snapshot(s),
          source: "staff",
          recorded_by: operator,
          staff_note: note,
        };
    const values = Object.values(fields);
    try {
      const result = await e.DB.batch([
        e.DB.prepare(
          `INSERT INTO ${table}(${Object.keys(fields).join(",")}) SELECT ${values.map(() => "?").join(",")} FROM sessions WHERE id=? AND version=?`,
        ).bind(...values, sid, version),
        audit(
          e,
          attendance ? "attendance.create" : "registration.staff_create",
          id,
          null,
          {
            session_id: sid,
            ...v,
            email,
            operator,
            note,
            source: attendance ? "confirmed_attendance" : "staff",
          },
          true,
        ),
      ]);
      if (!result[0].meta.changes)
        fail(409, "SESSION_CHANGED", "场次已改变，请刷新后台重新核对。");
    } catch (error) {
      const prior = await replay();
      if (prior) return prior;
      sqlError(error);
    }
    return json({ id, replayed: false, cancelled: false }, 201);
  }
  if (
    m === "GET" &&
    ["/api/admin/attendance", "/api/admin/attendance-export"].includes(p)
  ) {
    if (
      url.searchParams.get("history") !== "1" &&
      (await e.DB.prepare("SELECT id FROM attendance_checks LIMIT 1").first())
    )
      fail(
        409,
        "REFRESH_REQUIRED",
        "已有签到核对记录，请刷新网页后查看“参会核对”；原补记仅作为历史依据。",
      );
    const conditions: string[] = [],
      args: unknown[] = [],
      sid = url.searchParams.get("session"),
      q = url.searchParams.get("q")?.trim(),
      state = url.searchParams.get("state") || "active";
    if (sid) {
      conditions.push("a.session_id=?");
      args.push(sid);
    }
    if (q) {
      if (q.length > 120) fail(400, "QUERY_TOO_LONG", "搜索文字过长。");
      conditions.push(
        "(a.name LIKE ? ESCAPE '!' OR a.department LIKE ? ESCAPE '!' OR a.employee_id LIKE ? ESCAPE '!')",
      );
      const term = "%" + q.replace(/[!%_]/g, "!$&") + "%";
      args.push(term, term, term);
    }
    if (state === "active") conditions.push("a.cancelled_at IS NULL");
    else if (state === "cancelled")
      conditions.push("a.cancelled_at IS NOT NULL");
    else if (state !== "all") fail(400, "INVALID_STATE", "记录状态无效。");
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "",
      page = integer(Number(url.searchParams.get("page") || 1), 1, 1000000),
      exporting = p.endsWith("-export");
    const count = await e.DB.prepare(
      `SELECT count(*) AS n FROM attendance_records a ${where}`,
    )
      .bind(...args)
      .first();
    if (exporting && count!.n > 20000)
      fail(400, "EXPORT_TOO_LARGE", "请按场次筛选后分批导出。");
    const result = await e.DB.prepare(
      `SELECT a.id,a.session_id,a.name,a.department,a.employee_id,a.email,a.confirmed_by,a.confirmation_note,a.version,a.created_at,a.updated_at,a.cancelled_at,a.cancel_reason,s.title AS session_title,s.start_at,s.end_at,s.venue,s.state AS event_state,EXISTS(SELECT 1 FROM registrations r WHERE r.session_id=a.session_id AND r.employee_hash=a.employee_hash AND r.cancelled_at IS NULL) AS has_registration FROM attendance_records a JOIN sessions s ON s.id=a.session_id ${where} ORDER BY s.start_at,a.created_at,a.id LIMIT ? OFFSET ?`,
    )
      .bind(...args, exporting ? 20000 : 50, exporting ? 0 : (page - 1) * 50)
      .all();
    return json({
      records: result.results,
      total: count!.n,
      page,
      pageSize: 50,
    });
  }
  const match = p.match(/^\/api\/admin\/attendance\/([^/]+)(\/cancel)?$/);
  if (match && (match[2] ? m === "POST" : m === "PATCH")) {
    const b = await body(r),
      id = match[1],
      before = await e.DB.prepare("SELECT * FROM attendance_records WHERE id=?")
        .bind(id)
        .first();
    if (!before) fail(404, "NOT_FOUND", "参会补记不存在。");
    const safe = ({
      employee_hash: _,
      request_fingerprint: __,
      request_id: ___,
      ...rest
    }: Row) => rest;
    if (match[2]) {
      const reason = str(b.reason, 500);
      await update(
        e,
        e.DB.prepare(
          "UPDATE attendance_records SET cancelled_at=COALESCE(cancelled_at,unixepoch()),cancel_reason=?,version=version+1,updated_at=unixepoch() WHERE id=? AND version=?",
        ).bind(reason, id, integer(b.version, 1)),
        "attendance.cancel",
        id,
        safe(before),
        { reason },
      );
    } else {
      const v = profile(b),
        email = emailAddress(b.email, true),
        operator = str(b.operator, 80),
        note = str(b.note, 500);
      enforceFormalInputs(e, v.employeeId, email);
      if (e.APP_MODE !== "formal" && !v.employeeId.startsWith("TEST-"))
        fail(400, "TEST_ONLY", "测试环境请使用 TEST- 开头的虚构工号。");
      await update(
        e,
        e.DB.prepare(
          "UPDATE attendance_records SET name=?,department=?,employee_id=?,employee_hash=?,email=?,confirmed_by=?,confirmation_note=?,version=version+1,updated_at=unixepoch() WHERE id=? AND version=? AND cancelled_at IS NULL",
        ).bind(
          v.name,
          v.department,
          v.employeeId,
          await hmac("employee:" + v.employeeId, e.APP_SECRET),
          email,
          operator,
          note,
          id,
          integer(b.version, 1),
        ),
        "attendance.correct",
        id,
        safe(before),
        { ...v, email, operator, note },
      );
    }
    return json({ ok: true });
  }
  return null;
}
