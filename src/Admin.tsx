import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import {
  type Session,
  type Round,
  type Settings,
  type Template,
  previousEvening,
  stateLabels,
} from "../shared/model";
import { stamp } from "../shared/programme";
import { api, download } from "./api";
import { Modal, Message } from "./components";
import SessionEditor, { type EditSession } from "./SessionEditor";
import AdminRecords from "./AdminRecords";
import HistoryDiff from "./HistoryDiff";
type State = {
  sessions: Session[];
  rounds: Round[];
  settings: Settings;
  templates: Template[];
  mode: string;
};
type History = {
  id: number;
  action: string;
  target: string;
  before: any;
  after: any;
  created_at: number;
};
export default function Admin({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<State | null>(null),
    [checking, setChecking] = useState(true),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("sessions"),
    [edit, setEdit] = useState<EditSession | null>(null),
    [filter, setFilter] = useState("all"),
    [round, setRound] = useState("all"),
    [history, setHistory] = useState<History[] | null>(null),
    [historySession, setHistorySession] = useState<Session | null>(null),
    [notice, setNotice] = useState(""),
    [rules, setRules] = useState<Settings | null>(null),
    [roundEdit, setRoundEdit] = useState<Partial<Round> | null>(null),
    [passwordOpen, setPasswordOpen] = useState(false),
    [oldPass, setOldPass] = useState(""),
    [newPass, setNewPass] = useState(""),
    [repeatPass, setRepeatPass] = useState("");
  async function refresh() {
    try {
      setData(await api<State>("/admin/state"));
      setError("");
    } catch (e) {
      if ((e as any).status === 401) setData(null);
      else setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/login", { password });
      setPassword("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved(msg: string) {
    setEdit(null);
    setMessage(msg);
    void refresh();
    onChanged();
  }
  function fresh(source?: Session): EditSession {
    const now = new Date(),
      date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 7,
          3,
          30,
        ),
      );
    const start = source ? source.start_at + 7 * 86400 : date.getTime() / 1000,
      t = data!.templates[0];
    return {
      ...(source || {
        id: "",
        round_id: data!.rounds[0].id,
        sort_order: 0,
        template_key: t.key,
        title: t.title,
        title_en: t.title_en,
        subjects: t.subjects,
        agenda: t.agenda,
        venue: "示例活动室",
        capacity: 36,
        change_note: "",
        updated_at: 0,
        version: 1,
        content_version: 1,
      }),
      id: "",
      isNew: true,
      state: "draft",
      status: "draft",
      booked: 0,
      remaining: source?.capacity || 36,
      over_capacity: 0,
      start_at: start,
      end_at: start + (source ? source.end_at - source.start_at : 3600),
      deadline_at: previousEvening(start),
    };
  }
  async function showHistory(s?: Session) {
    await run(async () => {
      const h = await api<{ records: History[] }>(
        "/admin/audit" + (s ? "?target=" + s.id : ""),
      );
      setHistory(h.records);
      setHistorySession(s || null);
    });
  }
  function historyRestore(h: History) {
    if (!historySession || !h.before) return;
    const before = h.before;
    setEdit({
      ...historySession,
      ...before,
      subjects:
        typeof before.subjects === "string"
          ? JSON.parse(before.subjects)
          : before.subjects,
      agenda:
        typeof before.agenda === "string"
          ? JSON.parse(before.agenda)
          : before.agenda,
      version: historySession.version,
      content_version: historySession.content_version,
      booked: historySession.booked,
      change_note: "恢复先前安排，请核对当前报名情况。",
    });
    setHistory(null);
  }
  function noticeText(s: Session) {
    setNotice(
      "【生活导师培训安排通知】\n" +
        s.title +
        "\n活动状态：" +
        stateLabels[s.status] +
        "\n时间：" +
        stamp(s.start_at) +
        "—" +
        stamp(s.end_at) +
        "（北京时间）\n地点：" +
        s.venue +
        "\n报名截止：" +
        stamp(s.deadline_at) +
        "\n" +
        (s.change_note ? "说明：" + s.change_note + "\n" : "") +
        "已有报名保留，请已报名老师进入“我的报名”核对最新安排。如不能参加，请联系工作人员协调。\n" +
        data!.settings.contact,
    );
  }
  if (checking) return <p className="loading">正在核对工作人员登录…</p>;
  if (!data)
    return (
      <section className="admin-login">
        <LockKeyhole size={28} />
        <h1>工作人员入口</h1>
        <p>管理场次、报名名单与培训安排。</p>
        <form onSubmit={login}>
          <label>
            工作人员口令
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <Message>{error}</Message>}
          <button className="button primary full" disabled={busy}>
            {busy ? "正在登录…" : "登录后台"}
          </button>
        </form>
      </section>
    );
  const list = data.sessions.filter(
    (s) =>
      (filter === "all" || s.state === filter) &&
      (round === "all" || s.round_id === round),
  );
  return (
    <section className="admin">
      <div className="section-heading">
        <div>
          <h1>培训管理</h1>
          <p className="muted">
            {data.mode === "formal" ? "正式报名" : "测试环境"} ·{" "}
            {data.sessions.length} 个场次 ·{" "}
            {data.settings.registration_open === "true"
              ? "报名入口开放"
              : "报名入口关闭"}
          </p>
        </div>
        <div className="button-row">
          <button className="text-button" onClick={() => void refresh()}>
            刷新
          </button>
          <button
            className="text-button"
            onClick={() => {
              setPasswordOpen(true);
              setError("");
            }}
          >
            修改口令
          </button>
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await api("/admin/logout", {});
                setData(null);
              })
            }
          >
            退出
          </button>
        </div>
      </div>
      {message && <Message success>{message}</Message>}
      {error && !rules && !roundEdit && !passwordOpen && (
        <Message>{error}</Message>
      )}
      <div className="admin-tabs">
        {[
          ["sessions", "场次与轮次"],
          ["records", "报名名单"],
          ["settings", "规则与备份"],
        ].map(([v, label]) => (
          <button
            key={v}
            className={tab === v ? "active" : ""}
            onClick={() => setTab(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "sessions" ? (
        <>
          <div className="records-toolbar">
            <label>
              轮次
              <select value={round} onChange={(e) => setRound(e.target.value)}>
                <option value="all">全部轮次</option>
                {data.rounds.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部状态</option>
                {["draft", "published", "paused", "cancelled", "archived"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {stateLabels[s]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button className="button primary" onClick={() => setEdit(fresh())}>
              新增场次
            </button>
            <button
              className="button secondary"
              onClick={() =>
                setRoundEdit({
                  title: "新轮次",
                  sort_order: data.rounds.length + 1,
                })
              }
            >
              新增轮次
            </button>
          </div>
          <div className="round-chips">
            {data.rounds.map((r) => (
              <button
                key={r.id}
                className="text-button"
                onClick={() => {
                  setRoundEdit({ ...r });
                  setError("");
                }}
              >
                {r.title} · 编辑
              </button>
            ))}
          </div>
          <div className="staff-session-list">
            {list.map((s) => (
              <article key={s.id} className="staff-session">
                <div>
                  <small>
                    {data.rounds.find((r) => r.id === s.round_id)?.title} ·{" "}
                    {stateLabels[s.status]}
                  </small>
                  <h3>{s.title}</h3>
                  <p>
                    {stamp(s.start_at)} — {stamp(s.end_at)} · {s.venue}
                  </p>
                  <p>
                    截止 {stamp(s.deadline_at)} · 已报名 {s.booked} /{" "}
                    {s.capacity} 人{" "}
                    {s.over_capacity > 0 && (
                      <strong className="danger">
                        （超额 {s.over_capacity} 人）
                      </strong>
                    )}
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => setEdit({ ...s })}
                  >
                    编辑 / 改期
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setEdit(fresh(s))}
                  >
                    复制场次
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setEdit({
                        ...s,
                        state:
                          s.state === "cancelled" || s.state === "archived"
                            ? "paused"
                            : s.state === "paused"
                              ? "published"
                              : "paused",
                      })
                    }
                  >
                    {["cancelled", "archived"].includes(s.state)
                      ? "恢复场次"
                      : s.state === "paused"
                        ? "恢复报名"
                        : "暂停"}
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => setEdit({ ...s, state: "cancelled" })}
                  >
                    取消活动
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setEdit({ ...s, state: "archived" })}
                  >
                    归档
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void showHistory(s)}
                  >
                    修改记录
                  </button>
                  <button className="text-button" onClick={() => noticeText(s)}>
                    通知文案
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : tab === "records" ? (
        <AdminRecords
          sessions={data.sessions}
          onChanged={() => {
            void refresh();
            onChanged();
          }}
        />
      ) : (
        <div className="settings-panel">
          <h2>报名规则</h2>
          <p>
            每人可报：
            {data.settings.max_sessions === "0"
              ? "不限"
              : data.settings.max_sessions + "场"}{" "}
            · 自行取消：
            {data.settings.self_cancel === "true" ? "允许（截止前）" : "不允许"}
          </p>
          <p>报名事务联系：{data.settings.contact}</p>
          <button
            className="button secondary"
            onClick={() => {
              setRules({ ...data.settings });
              setError("");
            }}
          >
            修改报名规则
          </button>
          <h2>数据与维护</h2>
          <p>
            备份包含场次、名单和修改记录，含个人资料，请仅存放在工作人员控制的位置。恢复会替换数据，需由维护人员核对备份后处理。
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await api("/admin/backup");
                  download(
                    "生活导师备份-" +
                      new Date().toISOString().replaceAll(":", "-") +
                      ".json",
                    JSON.stringify(value, null, 2),
                    "application/json",
                  );
                  setMessage("备份已下载，请妥善保存。");
                })
              }
            >
              下载完整备份
            </button>
            <button
              className="button secondary"
              onClick={() => void showHistory()}
            >
              最近操作记录
            </button>
          </div>
          <p className="muted">
            使用共享工作人员口令；修改记录显示操作内容与时间，不用于区分具体操作者。修改口令后所有已登录的后台都会退出。
          </p>
        </div>
      )}
      {edit && (
        <SessionEditor
          key={edit.id + ":" + String(edit.isNew)}
          initial={edit}
          rounds={data.rounds}
          templates={data.templates}
          onClose={() => setEdit(null)}
          onSaved={saved}
        />
      )}
      {roundEdit && (
        <Modal
          title={roundEdit.id ? "编辑轮次" : "新增轮次"}
          onClose={() => setRoundEdit(null)}
        >
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  "/admin/rounds" + (roundEdit.id ? "/" + roundEdit.id : ""),
                  roundEdit,
                  roundEdit.id ? "PATCH" : "POST",
                );
                setRoundEdit(null);
                await refresh();
                onChanged();
              });
            }}
          >
            <label>
              轮次名称
              <input
                required
                maxLength={120}
                value={roundEdit.title}
                onChange={(e) =>
                  setRoundEdit({ ...roundEdit, title: e.target.value })
                }
              />
            </label>
            <label>
              排序
              <input
                type="number"
                min={0}
                max={100000}
                value={roundEdit.sort_order}
                onChange={(e) =>
                  setRoundEdit({
                    ...roundEdit,
                    sort_order: Number(e.target.value),
                  })
                }
              />
            </label>
            {error && <Message>{error}</Message>}
            <button className="button primary" disabled={busy}>
              保存轮次
            </button>
          </form>
        </Modal>
      )}
      {rules && (
        <Modal title="报名规则" onClose={() => setRules(null)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  "/admin/settings",
                  {
                    ...rules,
                    version: Number(rules.version),
                    max_sessions: Number(rules.max_sessions),
                    registration_open: rules.registration_open === "true",
                    self_cancel: rules.self_cancel === "true",
                  },
                  "PATCH",
                );
                setRules(null);
                setMessage(
                  "报名规则已保存。已有报名保留，新提交按新规则核验。",
                );
                await refresh();
                onChanged();
              });
            }}
          >
            <label>
              每人最多可报场数（0表示不限）
              <input
                type="number"
                min={0}
                max={100000}
                value={rules.max_sessions}
                onChange={(e) =>
                  setRules({ ...rules, max_sessions: e.target.value })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={rules.registration_open === "true"}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    registration_open: String(e.target.checked),
                  })
                }
              />
              <span>开放报名入口</span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={rules.self_cancel === "true"}
                onChange={(e) =>
                  setRules({ ...rules, self_cancel: String(e.target.checked) })
                }
              />
              <span>
                允许老师在截止前自行取消；改期后可在活动开始前重新决定
              </span>
            </label>
            <label>
              报名事务联系人 / 联系方式
              <textarea
                required
                maxLength={1000}
                value={rules.contact}
                onChange={(e) =>
                  setRules({ ...rules, contact: e.target.value })
                }
              />
            </label>
            <label>
              资料使用与保存说明
              <textarea
                required
                maxLength={3000}
                value={rules.retention}
                onChange={(e) =>
                  setRules({ ...rules, retention: e.target.value })
                }
              />
            </label>
            {error && <Message>{error}</Message>}
            <p className="muted">
              减少每人场数不取消已有报名；已取消或归档的活动不占新报名的场数限制。
            </p>
            <button className="button primary" disabled={busy}>
              保存规则
            </button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title="修改记录" wide onClose={() => setHistory(null)}>
          {!history.length && <p>暂无修改记录。</p>}
          {history.map((h) => (
            <div className="history-item" key={h.id}>
              <strong>
                {stamp(h.created_at)} ·{" "}
                {(
                  {
                    "session.update": "修改场次",
                    "session.create": "新增场次",
                    "registration.correct": "纠正报名信息",
                    "registration.cancel": "取消个人报名",
                    "round.create": "新增轮次",
                    "round.update": "修改轮次",
                    "settings.update": "修改规则",
                    "password.change": "修改口令",
                  } as Record<string, string>
                )[h.action] || h.action}
              </strong>
              <details>
                <summary>查看修改前后</summary>
                <HistoryDiff
                  before={h.before}
                  after={h.after}
                  rounds={data.rounds}
                />
              </details>
              {historySession && h.action === "session.update" && h.before && (
                <button
                  className="text-button"
                  onClick={() => historyRestore(h)}
                >
                  用修改前的安排回填编辑
                </button>
              )}
            </div>
          ))}
        </Modal>
      )}
      {!!notice && (
        <Modal title="变更通知文案" onClose={() => setNotice("")}>
          <p>
            系统不自动发送通知。请核对后复制到工作群，或按名单联系受影响老师。
          </p>
          <textarea
            className="notice-text"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
          />
          <button
            className="button primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(notice);
                setMessage("通知文案已复制，尚未发送。");
                setNotice("");
              } catch {
                download("培训通知.txt", notice);
              }
            }}
          >
            复制通知文案
          </button>
        </Modal>
      )}
      {passwordOpen && (
        <Modal title="修改工作人员口令" onClose={() => setPasswordOpen(false)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPass !== repeatPass) {
                setError("两次新口令不一致。");
                return;
              }
              void run(async () => {
                await api("/admin/password", {
                  currentPassword: oldPass,
                  newPassword: newPass,
                });
                setOldPass("");
                setNewPass("");
                setRepeatPass("");
                setPasswordOpen(false);
                setData(null);
                setMessage("口令已修改，请重新登录。");
              });
            }}
          >
            <label>
              当前口令
              <input
                type="password"
                required
                autoComplete="current-password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
              />
            </label>
            <label>
              新口令（至少16字符）
              <input
                type="password"
                required
                minLength={16}
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </label>
            <label>
              再次输入新口令
              <input
                type="password"
                required
                minLength={16}
                autoComplete="new-password"
                value={repeatPass}
                onChange={(e) => setRepeatPass(e.target.value)}
              />
            </label>
            <p>保存后，所有工作人员登录都会立即失效。</p>
            {error && <Message>{error}</Message>}
            <button className="button primary" disabled={busy}>
              保存并退出所有登录
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
