import {
  type Env,
  type Row,
  json,
  fail,
  str,
  body,
  integer,
  digest,
  session,
  audit,
  sqlError,
} from "./core";
import {
  basis,
  reviewPeople,
  type Evidence,
  type Check,
  type ReviewData,
  type Outcome,
} from "../shared/attendance";
import { normalizeEmployee } from "../shared/model";

// SELECT only explicit business fields; no receipts, identity hashes or request secrets leave this module.
export async function reviewSnapshot(
  e: Env,
  ids: string[],
): Promise<ReviewData[]> {
  const list = JSON.stringify(ids),
    filter = "session_id IN (SELECT value FROM json_each(?))";
  const result = await e.DB.batch([
    e.DB.prepare(
      "SELECT * FROM sessions WHERE id IN (SELECT value FROM json_each(?)) ORDER BY start_at,sort_order,id",
    ).bind(list),
    e.DB.prepare(
      `SELECT id,session_id,employee_id,name,department,email,version,cancelled_at,'registration' kind,recorded_by operator,staff_note note,created_at recorded_at FROM registrations WHERE ${filter}
   UNION ALL SELECT id,session_id,employee_id,name,department,email,version,cancelled_at,'attendance' kind,confirmed_by operator,confirmation_note note,updated_at recorded_at FROM attendance_records WHERE ${filter} LIMIT 20001`,
    ).bind(list, list),
    e.DB.prepare(
      `SELECT * FROM attendance_checks WHERE ${filter} LIMIT 20001`,
    ).bind(list),
    e.DB.prepare(`SELECT * FROM attendance_revisions WHERE ${filter}`).bind(
      list,
    ),
  ]);
  if (result[0].results.length !== ids.length)
    fail(404, "SESSION_NOT_FOUND", "所选场次不存在，请刷新后重选。");
  if (result[1].results.length > 20000 || result[2].results.length > 20000)
    fail(
      400,
      "EXPORT_TOO_LARGE",
      "记录超过单次处理上限，请减少所选场次；未生成不完整名单。",
    );
  const now = Math.floor(Date.now() / 1000);
  return result[0].results.map((r) => {
    const s = session(r);
    return {
      session: s,
      revision:
        result[3].results.find((x) => x.session_id === s.id)?.revision || 0,
      generatedAt: now,
      people: reviewPeople(
        s,
        result[1].results.filter((x) => x.session_id === s.id) as Evidence[],
        result[2].results.filter((x) => x.session_id === s.id) as Check[],
        now,
        result[3].results.find((x) => x.session_id === s.id)?.time_changed_at ||
          0,
      ),
    };
  });
}
export async function attendanceReview(
  r: Request,
  e: Env,
  url: URL,
): Promise<Response | null> {
  const p = url.pathname;
  if (p === "/api/admin/attendance-review" && r.method === "GET")
    return json(
      (await reviewSnapshot(e, [str(url.searchParams.get("session"), 80)]))[0],
    );
  if (p === "/api/admin/attendance-term" && r.method === "GET") {
    const ids = [
      ...new Set(str(url.searchParams.get("sessions"), 16000).split(",")),
    ];
    if (ids.length > 200 || ids.some((x) => !x || x.length > 80))
      fail(400, "INVALID_SCOPE", "请选择1至200场活动。");
    return json({
      events: await reviewSnapshot(e, ids),
      generatedAt: Math.floor(Date.now() / 1000),
    });
  }
  if (p === "/api/admin/attendance-batch" && r.method === "GET") {
    const b = await e.DB.prepare(
      "SELECT id,session_id,count,created_at FROM attendance_batches WHERE id=?",
    )
      .bind(str(url.searchParams.get("id"), 40))
      .first();
    return json({ saved: !!b, batch: b });
  }
  if (p !== "/api/admin/attendance-review" || r.method !== "POST") return null;
  const b = await body(r),
    sid = str(b.sessionId, 80),
    id = str(b.requestId, 40),
    operator = str(b.operator, 80),
    note = str(b.note, 1000),
    rev = integer(b.revision, 0, Number.MAX_SAFE_INTEGER);
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    b.confirmed !== true ||
    !Array.isArray(b.entries) ||
    !b.entries.length ||
    b.entries.length > 500
  )
    fail(400, "INVALID_REVIEW", "请核对后确认；一次最多处理500人。");
  const entries: { employeeId: string; outcome: Outcome }[] = b.entries
    .map((x: Row) => {
      const employeeId = normalizeEmployee(str(x.employeeId, 80));
      if (!["present", "absent", "unknown"].includes(x.outcome))
        fail(400, "INVALID_OUTCOME", "请选择有效参会状态。");
      return { employeeId, outcome: x.outcome };
    })
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  if (new Set(entries.map((x) => x.employeeId)).size !== entries.length)
    fail(400, "DUPLICATE_PERSON", "同一批不能重复包含同一个工号。");
  const fingerprint = await digest(
    JSON.stringify([sid, operator, note, rev, entries]),
  );
  async function replay() {
    const old = await e.DB.prepare(
      "SELECT fingerprint,count FROM attendance_batches WHERE id=?",
    )
      .bind(id)
      .first();
    if (!old) return null;
    if (old.fingerprint !== fingerprint)
      fail(409, "REQUEST_CONFLICT", "这次提交内容已变化，请重新核对。");
    return json({ ok: true, replayed: true, count: old.count, batchId: id });
  }
  const prior = await replay();
  if (prior) return prior;
  const snapshot = (await reviewSnapshot(e, [sid]))[0],
    s = snapshot.session,
    now = Math.floor(Date.now() / 1000);
  if (snapshot.revision !== rev)
    fail(
      409,
      "REVIEW_CHANGED",
      "名单已变化，请刷新名单、重新勾选后保存；本次没有修改。",
    );
  if (
    !["published", "paused", "archived"].includes(s.state) ||
    s.start_at > now
  )
    fail(
      409,
      "REVIEW_UNAVAILABLE",
      "活动尚未开始、已取消或为草稿，请先核对活动安排。",
    );
  if (entries.some((x) => x.outcome === "absent") && s.end_at > now)
    fail(409, "REVIEW_TOO_EARLY", "活动结束后才能确认未到场。");
  const changed = entries.map((x) => {
    const person = snapshot.people.find((p) => p.employee_id === x.employeeId);
    if (!person || (!person.evidence.length && x.outcome !== "unknown"))
      fail(
        409,
        "PERSON_CHANGED",
        "人员身份已更正或不存在，请先更正原记录；旧工号可恢复待核对以解除关联。",
      );
    if (person.conflict.includes("不一致"))
      fail(409, "PROFILE_CONFLICT", "姓名、部门或邮箱不一致，请先更正原记录。");
    if (
      x.outcome === "absent" &&
      !person.registered &&
      !person.legacyPresent &&
      !person.check
    )
      fail(
        409,
        "NO_ATTENDANCE_EXPECTATION",
        "已取消且无到场记录的人员不自动视为缺席。",
      );
    return {
      id: person.check?.id || crypto.randomUUID(),
      session_id: sid,
      employee_id: x.employeeId,
      name: person.name,
      department: person.department,
      email: person.email,
      outcome: x.outcome,
      basis_json: JSON.stringify(basis(person.evidence)),
      session_start: s.start_at,
      session_end: s.end_at,
      operator,
      note,
      checked_at: now,
      batch_id: id,
    };
  });
  try {
    await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO edit_guards(scope,expected,actual) SELECT ?,?,CAST(COALESCE((SELECT revision FROM attendance_revisions WHERE session_id=?),0) AS TEXT)",
      ).bind(id, String(rev), sid),
      e.DB.prepare("DELETE FROM edit_guards WHERE scope=?").bind(id),
      e.DB.prepare(
        "INSERT INTO attendance_batches(id,session_id,fingerprint,operator,note,count) VALUES (?,?,?,?,?,?)",
      ).bind(id, sid, fingerprint, operator, note, changed.length),
      e.DB.prepare(
        `INSERT INTO attendance_checks(id,session_id,employee_id,name,department,email,outcome,basis_json,session_start,session_end,operator,note,checked_at,batch_id)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.session_id'),json_extract(value,'$.employee_id'),json_extract(value,'$.name'),json_extract(value,'$.department'),json_extract(value,'$.email'),json_extract(value,'$.outcome'),json_extract(value,'$.basis_json'),json_extract(value,'$.session_start'),json_extract(value,'$.session_end'),json_extract(value,'$.operator'),json_extract(value,'$.note'),json_extract(value,'$.checked_at'),json_extract(value,'$.batch_id') FROM json_each(?) WHERE true
    ON CONFLICT(session_id,employee_id) DO UPDATE SET name=excluded.name,department=excluded.department,email=excluded.email,outcome=excluded.outcome,basis_json=excluded.basis_json,session_start=excluded.session_start,session_end=excluded.session_end,operator=excluded.operator,note=excluded.note,checked_at=excluded.checked_at,batch_id=excluded.batch_id,version=attendance_checks.version+1`,
      ).bind(JSON.stringify(changed)),
      audit(
        e,
        "attendance.review",
        sid,
        entries.map(
          (x) =>
            snapshot.people.find((p) => p.employee_id === x.employeeId)
              ?.check || {
              employee_id: x.employeeId,
              outcome: snapshot.people.find(
                (p) => p.employee_id === x.employeeId,
              )?.outcome,
            },
        ),
        { batchId: id, operator, note, entries: changed },
      ),
    ]);
  } catch (error) {
    const retry = await replay();
    if (retry) return retry;
    sqlError(error);
  }
  return json(
    { ok: true, replayed: false, count: changed.length, batchId: id },
    201,
  );
}
