import { admin } from "./admin";
import {
  type Env,
  HttpError,
  fail,
  json,
  body,
  str,
  integer,
  digest,
  hmac,
  randomToken,
  settings,
  allSessions,
  getSession,
  snapshot,
  sqlError,
  throttle,
  cookie,
  setCookie,
  requireAdmin,
  passwordMatches,
  profile,
  receipts,
  owned,
  registrationView,
} from "./core";
export default {
  async fetch(r: Request, e: Env): Promise<Response> {
    const url = new URL(r.url),
      p = url.pathname,
      m = r.method;
    if (!p.startsWith("/api/")) return e.ASSETS.fetch(r);
    try {
      if (!e.APP_SECRET || !e.ADMIN_PASSWORD)
        fail(503, "SETUP_REQUIRED", "报名系统暂未完成配置。");
      if (
        !["GET", "HEAD"].includes(m) &&
        r.headers.has("origin") &&
        r.headers.get("origin") !== url.origin
      )
        fail(403, "ORIGIN", "请从本站页面提交。");
      if (p === "/api/health" && m === "GET") {
        const v = await e.DB.prepare("SELECT version FROM schema_meta").first();
        const c = await settings(e);
        return json({
          ok: v?.version === 2,
          version: 2,
          mode: e.APP_MODE,
          registrationOpen:
            e.APP_MODE === "formal" && c.registration_open === "true",
        });
      }
      if (p === "/api/sessions" && m === "GET") {
        const [sessions, rounds, config] = await Promise.all([
          allSessions(e),
          e.DB.prepare("SELECT * FROM rounds ORDER BY sort_order,id").all(),
          settings(e),
        ]);
        return json({
          sessions,
          rounds: rounds.results,
          settings: config,
          serverNow: Math.floor(Date.now() / 1000),
          mode: e.APP_MODE,
          dataSpace: e.DATA_SPACE || e.APP_MODE,
        });
      }
      if (p === "/api/register" && m === "POST") {
        await throttle(
          e,
          "submit-ip:" + (r.headers.get("CF-Connecting-IP") || "local"),
          2000,
        );
        const b = await body(r),
          v = profile(b);
        if (e.APP_MODE !== "formal" && !v.employeeId.startsWith("TEST-"))
          fail(400, "TEST_ONLY", "测试环境请使用 TEST- 开头的虚构工号。");
        const employeeHash = await hmac(
          "employee:" + v.employeeId,
          e.APP_SECRET,
        );
        await throttle(e, "employee:" + employeeHash, 20);
        const sessionId = str(b.sessionId, 80),
          requestId = str(b.requestId, 40),
          receipt = str(b.receipt, 100),
          revision = integer(b.contentRevision, 1);
        if (
          !/^[a-f0-9-]{36}$/.test(requestId) ||
          !/^mr_[a-f0-9]{64}$/.test(receipt) ||
          b.consent !== true
        )
          fail(400, "INVALID_REQUEST", "请核对报名信息并勾选确认。");
        const receiptHash = await digest(receipt),
          fingerprint = await hmac(
            JSON.stringify([
              sessionId,
              v.name,
              v.department,
              v.employeeId,
              revision,
            ]),
            e.APP_SECRET,
          );
        async function replay() {
          const row = await e.DB.prepare(
            "SELECT id,receipt_hash,request_fingerprint,cancelled_at FROM registrations WHERE request_id=?",
          )
            .bind(requestId)
            .first();
          if (!row) return null;
          if (
            row.receipt_hash !== receiptHash ||
            row.request_fingerprint !== fingerprint
          )
            fail(
              409,
              "REQUEST_CONFLICT",
              "这次提交内容已变更，请重新核对后提交。",
            );
          return json({
            id: row.id,
            replayed: true,
            cancelled: !!row.cancelled_at,
          });
        }
        const prior = await replay();
        if (prior) return prior;
        const s = await getSession(e, sessionId),
          id = crypto.randomUUID();
        try {
          await e.DB.prepare(
            "INSERT INTO registrations(id,session_id,name,department,employee_id,employee_hash,receipt_hash,request_id,request_fingerprint,confirmed_revision,snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          )
            .bind(
              id,
              sessionId,
              v.name,
              v.department,
              v.employeeId,
              employeeHash,
              receiptHash,
              requestId,
              fingerprint,
              revision,
              snapshot(s),
            )
            .run();
        } catch (error) {
          const retry = await replay();
          if (retry) return retry;
          sqlError(error);
        }
        return json({ id, replayed: false, cancelled: false }, 201);
      }
      if (p === "/api/mine" && m === "POST") {
        const tokens = receipts(await body(r));
        if (!tokens.length) return json({ registrations: [] });
        const hashes = await Promise.all(tokens.map(digest));
        const [rows, sessions, c] = await Promise.all([
          e.DB.prepare(
            `SELECT * FROM registrations WHERE receipt_hash IN (${hashes.map(() => "?").join(",")})`,
          )
            .bind(...hashes)
            .all(),
          allSessions(e, true),
          settings(e),
        ]);
        return json({
          registrations: rows.results.map((x) =>
            registrationView(
              x,
              sessions.find((s) => s.id === x.session_id)!,
              c,
              hashes.indexOf(x.receipt_hash),
            ),
          ),
        });
      }
      if (p === "/api/cancel" && m === "POST") {
        const b = await body(r),
          row = await owned(e, b);
        await throttle(e, "cancel:" + row.receipt_hash, 30);
        if (row.cancelled_at) return json({ ok: true });
        const result = await e.DB.prepare(
          `UPDATE registrations SET cancelled_at=unixepoch(),cancel_reason='本人取消',version=version+1 WHERE id=? AND cancelled_at IS NULL AND (SELECT value FROM settings WHERE key='self_cancel')='true' AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=registrations.session_id AND s.state IN ('published','paused') AND (s.deadline_at>unixepoch() OR (s.content_version<>registrations.confirmed_revision AND s.start_at>unixepoch())))`,
        )
          .bind(row.id)
          .run();
        if (!result.meta.changes)
          fail(409, "CANNOT_CANCEL", "目前不能自行取消，请联系工作人员。");
        return json({ ok: true });
      }
      if (p === "/api/confirm-change" && m === "POST") {
        const b = await body(r),
          row = await owned(e, b),
          s = await getSession(e, row.session_id),
          rev = integer(b.contentRevision, 1);
        if (s.content_version !== rev)
          fail(409, "SESSION_CHANGED", "活动又有更新，请刷新后再确认。");
        const result = await e.DB.prepare(
          `UPDATE registrations SET confirmed_revision=?,snapshot=?,version=version+1 WHERE id=? AND cancelled_at IS NULL AND EXISTS(SELECT 1 FROM sessions WHERE id=registrations.session_id AND content_version=? AND state IN ('published','paused'))`,
        )
          .bind(rev, snapshot(s), row.id, rev)
          .run();
        if (!result.meta.changes)
          fail(409, "SESSION_CHANGED", "活动又有更新，请刷新后再确认。");
        return json({ ok: true });
      }
      if (p === "/api/admin/login" && m === "POST") {
        await throttle(
          e,
          "login:" + (r.headers.get("CF-Connecting-IP") || "local"),
          30,
        );
        const b = await body(r);
        if (!(await passwordMatches(e, str(b.password, 300))))
          fail(401, "BAD_PASSWORD", "工作人员口令不正确。");
        const token = randomToken();
        await e.DB.batch([
          e.DB.prepare(
            "DELETE FROM admin_sessions WHERE expires_at<=unixepoch()",
          ),
          e.DB.prepare(
            "INSERT INTO admin_sessions(token_hash,expires_at) VALUES (?,unixepoch()+28800)",
          ).bind(await digest(token)),
        ]);
        return json({ ok: true }, 200, {
          "Set-Cookie": setCookie(r, token, 28800),
        });
      }
      if (p === "/api/admin/logout" && m === "POST") {
        await e.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?")
          .bind(await digest(cookie(r)))
          .run();
        return json({ ok: true }, 200, { "Set-Cookie": setCookie(r, "", 0) });
      }
      if (p.startsWith("/api/admin/")) {
        await requireAdmin(r, e);
        return await admin(r, e, url);
      }
      fail(404, "NOT_FOUND", "没有找到这个操作。");
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.message, code: error.code, ...error.details },
          error.status,
        );
      try {
        sqlError(error);
      } catch (mapped) {
        if (mapped instanceof HttpError)
          return json(
            { error: mapped.message, code: mapped.code, ...mapped.details },
            mapped.status,
          );
      }
      return json(
        {
          error:
            "服务暂时不可用，请稍后重试。若刚提交过报名，请先查看“我的报名”。",
          code: "SERVICE_UNAVAILABLE",
        },
        503,
      );
    }
  },
};
