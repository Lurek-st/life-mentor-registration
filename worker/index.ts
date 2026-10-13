import { canonicalOrigin } from "./canonical";
import { admin } from "./admin";
import { burstAllowed } from "./burst";
import { publicSessions, publicHealth, invalidatePublic } from "./publicCache";
import {
  type Env,
  HttpError,
  fail,
  json,
  body,
  str,
  passwordText,
  integer,
  digest,
  hmac,
  randomToken,
  settings,
  session,
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
  emailAddress,
  enforceFormalInputs,
  update,
} from "./core";
export default {
  async fetch(r: Request, e: Env): Promise<Response> {
    const url = new URL(r.url),
      p = url.pathname,
      m = r.method;
    if (!p.startsWith("/api/")) return e.ASSETS.fetch(r);
    try {
      if (e.APP_MODE === "formal") {
        let canonical: string;
        try {
          canonical = canonicalOrigin(url, e.CANONICAL_ORIGIN);
        } catch {
          fail(503, "SETUP_REQUIRED", "报名系统暂未完成配置。");
        }
        if (url.origin !== canonical)
          return json(
            {
              code: "CANONICAL_ONLY",
              error: "请使用正式报名网址。",
              url: canonical + "/",
              release: "3.0.1",
              mode: "formal",
              active: false,
            },
            410,
          );
      }
      if (!e.APP_SECRET || !e.ADMIN_PASSWORD)
        fail(503, "SETUP_REQUIRED", "报名系统暂未完成配置。");
      if (
        !["GET", "HEAD"].includes(m) &&
        r.headers.has("origin") &&
        r.headers.get("origin") !== url.origin
      )
        fail(403, "ORIGIN", "请从本站页面提交。");
      const lane =
        p === "/api/admin/login"
          ? "login"
          : ["GET", "HEAD"].includes(m)
            ? "read"
            : "write";
      const limit = lane === "login" ? 30 : 2000;
      if (
        !burstAllowed(
          lane + ":" + (r.headers.get("CF-Connecting-IP") || "local"),
          limit,
        )
      )
        fail(429, "RATE_LIMIT", "操作较频繁，请稍等一分钟后再试。");
      if (p === "/api/health" && m === "GET") {
        const { version, config: c } = await publicHealth(e);
        if (version !== 2)
          fail(
            503,
            "DB_UPGRADE_REQUIRED",
            "数据库需要完成升级，请联系维护人员。",
            { ok: false },
          );
        return json({
          ok: version === 2,
          version: 2,
          release: "3.0.1",
          mode: e.APP_MODE,
          registrationOpen:
            e.APP_MODE === "formal" && c.registration_open === "true",
        });
      }
      if (p === "/api/sessions" && m === "GET") {
        const { rows, rounds, config } = await publicSessions(e);
        return json({
          sessions: rows.map(session),
          rounds,
          settings: config,
          serverNow: Math.floor(Date.now() / 1000),
          mode: e.APP_MODE,
          dataSpace: e.DATA_SPACE || e.APP_MODE,
        });
      }
      if (p === "/api/register" && m === "POST") {
        const b = await body(r),
          v = profile(b);
        if (e.APP_MODE !== "formal" && !v.employeeId.startsWith("TEST-"))
          fail(400, "TEST_ONLY", "测试环境请使用 TEST- 开头的虚构工号。");
        const employeeHash = await hmac(
          "employee:" + v.employeeId,
          e.APP_SECRET,
        );
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
          email = b.email === undefined ? "" : emailAddress(b.email, true),
          fingerprint = await hmac(
            JSON.stringify([
              sessionId,
              v.name,
              v.department,
              v.employeeId,
              revision,
              ...(b.email === undefined ? [] : [email]),
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
        // Preserve recovery of pre-upgrade submissions before enforcing the new field.
        emailAddress(email);
        enforceFormalInputs(e, v.employeeId, email);
        const id = crypto.randomUUID();
        try {
          // Reject an already unavailable session before writing any quota counters.
          // The INSERT triggers remain authoritative if capacity/deadline/state changes
          // after this read. Successful retries above still recover their original result.
          const s = await getSession(e, sessionId);
          if (s.state !== "published")
            fail(409, "SESSION_UNAVAILABLE", "这场活动当前不能报名。");
          if (s.deadline_at <= Math.floor(Date.now() / 1000))
            fail(409, "DEADLINE_PASSED", "本场已截止报名。");
          if (s.content_version !== revision)
            fail(
              409,
              "SESSION_CHANGED",
              "场次安排已更新，请核对最新日期、时间和内容后再提交。",
            );
          if (s.booked_count >= s.capacity)
            fail(409, "SESSION_FULL", "本场已报满，请选择其他场次。");
          await throttle(
            e,
            "submit-ip:" + (r.headers.get("CF-Connecting-IP") || "local"),
            2000,
          );
          await throttle(e, "employee:" + employeeHash, 20);
          await throttle(
            e,
            "email:" + (await hmac(email.toLowerCase(), e.APP_SECRET)),
            20,
          );
          await e.DB.prepare(
            "INSERT INTO registrations(id,session_id,name,department,employee_id,employee_hash,receipt_hash,request_id,request_fingerprint,confirmed_revision,snapshot,email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
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
              email,
            )
            .run();
        } catch (error) {
          const retry = await replay();
          if (retry) return retry;
          sqlError(error);
        }
        invalidatePublic(e);
        return json({ id, replayed: false, cancelled: false }, 201);
      }
      if (p === "/api/mine" && m === "POST") {
        const tokens = receipts(await body(r));
        if (!tokens.length) return json({ registrations: [] });
        const hashes = await Promise.all(tokens.map(digest));
        const rows = await e.DB.prepare(
          `SELECT * FROM registrations WHERE receipt_hash IN (${hashes.map(() => "?").join(",")})`,
        )
          .bind(...hashes)
          .all();
        if (!rows.results.length) return json({ registrations: [] });
        const ids = [...new Set(rows.results.map((x) => x.session_id))];
        const [raw, c] = await Promise.all([
          e.DB.prepare(
            `SELECT * FROM sessions WHERE id IN (${ids.map(() => "?").join(",")})`,
          )
            .bind(...ids)
            .all(),
          settings(e),
        ]);
        const sessions = raw.results.map(session);
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
      if (p === "/api/registration-email" && m === "PATCH") {
        const b = await body(r),
          row = await owned(e, b),
          email = emailAddress(b.email);
        enforceFormalInputs(e, undefined, email);
        await throttle(e, "email:" + row.receipt_hash, 20);
        await update(
          e,
          e.DB.prepare(
            "UPDATE registrations SET email=?,version=version+1 WHERE id=? AND version=?",
          ).bind(email, row.id, integer(b.version, 1)),
          "registration.email",
          row.id,
          { email: row.email || "" },
          { email },
        );
        return json({ ok: true });
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
        invalidatePublic(e);
        return json({ ok: true });
      }
      if (p === "/api/confirm-change" && m === "POST") {
        const b = await body(r),
          row = await owned(e, b),
          s = await getSession(e, row.session_id),
          rev = integer(b.contentRevision, 1);
        if (s.content_version !== rev)
          fail(409, "SESSION_CHANGED", "活动又有更新，请刷新后再确认。");
        if (row.cancelled_at || !["published", "paused"].includes(s.state))
          fail(
            409,
            "SESSION_CHANGED",
            "这条报名或活动已不可确认，请刷新后核对。",
          );
        if (row.confirmed_revision === rev) return json({ ok: true });
        await throttle(e, "confirm:" + row.receipt_hash, 20);
        const result = await e.DB.prepare(
          `UPDATE registrations SET confirmed_revision=?,snapshot=?,version=version+1 WHERE id=? AND cancelled_at IS NULL AND confirmed_revision<>? AND EXISTS(SELECT 1 FROM sessions WHERE id=registrations.session_id AND content_version=? AND state IN ('published','paused'))`,
        )
          .bind(rev, snapshot(s), row.id, rev, rev)
          .run();
        if (!result.meta.changes) {
          const confirmed = await e.DB.prepare(
            "SELECT 1 AS ok FROM registrations r JOIN sessions s ON s.id=r.session_id WHERE r.id=? AND r.cancelled_at IS NULL AND r.confirmed_revision=? AND s.content_version=? AND s.state IN ('published','paused')",
          )
            .bind(row.id, rev, rev)
            .first();
          if (!confirmed)
            fail(409, "SESSION_CHANGED", "活动又有更新，请刷新后再确认。");
        }
        return json({ ok: true });
      }
      if (p === "/api/admin/login" && m === "POST") {
        const b = await body(r),
          password = passwordText(b.password);
        await throttle(
          e,
          "login:" + (r.headers.get("CF-Connecting-IP") || "local"),
          30,
        );
        if (!(await passwordMatches(e, password)))
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
        if (/^[a-f0-9]{64}$/.test(cookie(r)))
          await e.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?")
            .bind(await digest(cookie(r)))
            .run();
        return json({ ok: true }, 200, { "Set-Cookie": setCookie(r, "", 0) });
      }
      if (p.startsWith("/api/admin/")) {
        await requireAdmin(r, e);
        const response = await admin(r, e, url);
        if (!["GET", "HEAD"].includes(m) && response.ok) invalidatePublic(e);
        return response;
      }
      fail(404, "NOT_FOUND", "没有找到这个操作。");
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.message, code: error.code, ...error.details },
          error.status,
          error.status === 429 ? { "Retry-After": "60" } : {},
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
