import { type Env, fail, json, session, str } from "./core";
import { reviewSnapshot } from "./attendanceReview";

// Only called after requireAdmin. One database batch gives a consistent event snapshot.
export async function combinedExport(e: Env, url: URL): Promise<Response> {
  const sid = str(url.searchParams.get("session"), 80);
  if (url.searchParams.get("format") === "review")
    return json((await reviewSnapshot(e, [sid]))[0]);
  if (
    await e.DB.prepare(
      "SELECT id FROM attendance_checks WHERE session_id=? LIMIT 1",
    )
      .bind(sid)
      .first()
  )
    fail(
      409,
      "REFRESH_REQUIRED",
      "本场已有签到核对，请刷新网页后使用新版总名单，避免遗漏核对结果。",
    );
  const [event, records] = await e.DB.batch([
    e.DB.prepare("SELECT * FROM sessions WHERE id=?").bind(sid),
    e.DB.prepare(
      `
      SELECT id,session_id,name,department,employee_id,email,source AS kind,created_at
      FROM registrations WHERE session_id=? AND cancelled_at IS NULL
      UNION ALL
      SELECT id,session_id,name,department,employee_id,email,'attendance' AS kind,created_at
      FROM attendance_records WHERE session_id=? AND cancelled_at IS NULL
      ORDER BY created_at,id LIMIT 20001
    `,
    ).bind(sid, sid),
  ]);
  if (!event.results.length)
    fail(404, "SESSION_NOT_FOUND", "这场活动不存在，请刷新场次后重试。");
  if (records.results.length > 20000)
    fail(
      400,
      "EXPORT_TOO_LARGE",
      "本场记录超出合并导出上限，请联系维护人员处理；未导出不完整名单。",
    );
  return json({
    session: session(event.results[0]),
    records: records.results,
    generatedAt: Math.floor(Date.now() / 1000),
  });
}
