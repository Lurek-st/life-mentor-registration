import { useCallback, useEffect, useState } from "react";
import { type Booking, stateLabels } from "../shared/model";
import { stamp } from "../shared/programme";
import {
  api,
  ApiError,
  attempts,
  saveAttempt,
  recover,
  download,
  type Attempt,
} from "./api";
import { Message, Modal } from "./components";
type Mine = Booking & { receipt: string };
export default function MyRegistrations({
  space,
  contact,
  onChanged,
}: {
  space: string;
  contact: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Mine[]>([]),
    [pending, setPending] = useState<Attempt[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [token, setToken] = useState(""),
    [cancel, setCancel] = useState<Mine | null>(null),
    [copied, setCopied] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const found = await recover(space);
      setRows(found);
      setPending(
        attempts(space).filter(
          (a) =>
            a.payload &&
            !a.id &&
            !a.failed &&
            !found.some((r) => r.receipt === a.receipt),
        ),
      );
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [space]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function action(path: string, row: Mine) {
    setBusy(true);
    setError("");
    try {
      await api(path, {
        id: row.id,
        receipt: row.receipt,
        contentRevision: row.session.content_version,
      });
      setCancel(null);
      await refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retry(a: Attempt) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/register", {
        ...a.payload,
        receipt: a.receipt,
        requestId: a.requestId,
      });
      saveAttempt(space, { ...a, id: result.id });
      await refresh();
      onChanged();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        saveAttempt(space, { ...a, failed: err.message });
        await refresh();
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }
  async function importToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const tokens = token.match(/mr_[a-f0-9]{64}/g) || [];
    if (!tokens.length) {
      setError("请粘贴完整私密报名凭证。");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ registrations: Booking[] }>("/mine", {
        receipts: tokens.slice(0, 90),
      });
      if (!result.registrations.length)
        throw Error("此凭证未找到报名，请核对是否为当前报名入口的凭证。");
      for (const r of result.registrations)
        saveAttempt(space, {
          receipt: tokens[r.receiptIndex!],
          requestId: "",
          sessionId: r.session_id,
          title: r.session.title,
          id: r.id,
        });
      setToken("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-page">
      <div className="section-heading">
        <div>
          <h1>我的报名</h1>
          <p className="muted">本浏览器已保存的报名与最新安排</p>
        </div>
        <button
          className="button secondary"
          onClick={() => void refresh()}
          disabled={busy}
        >
          刷新结果
        </button>
      </div>
      {error && <Message>{error}</Message>}
      {!loaded && !error && <p className="loading">正在核对报名记录…</p>}
      {pending.map((a) => (
        <div className="registration-card" key={a.receipt}>
          <h3>{a.title}</h3>
          <Message>
            上次提交尚未确认结果。已核对服务器，暂未找到记录；可以使用同一次提交重试，不会重复占位。
          </Message>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void retry(a)}
          >
            继续核对并重试
          </button>
        </div>
      ))}
      {rows.map((r) => (
        <article className="registration-card" key={r.id}>
          <div className="section-heading">
            <h3>{r.session.title}</h3>
            <span className={"badge " + (r.cancelled_at ? "muted" : "")}>
              {r.cancelled_at
                ? "本人报名已取消"
                : ["cancelled", "archived", "draft"].includes(r.session.state)
                  ? stateLabels[r.session.state]
                  : "已报名"}
            </span>
          </div>
          <p>
            {stamp(r.session.start_at)}—{stamp(r.session.end_at)} ·{" "}
            {r.session.venue}
          </p>
          <p>
            {r.name} · {r.department} · 工号 {r.employee_id}
          </p>
          {!r.cancelled_at && r.session.state === "cancelled" && (
            <Message>
              本场活动已取消，请留意工作人员后续安排。原报名记录保留。
            </Message>
          )}
          {!r.cancelled_at &&
            r.content_changed &&
            ["published", "paused"].includes(r.session.state) && (
              <Message>
                <strong>本场安排有更新，请重新核对。</strong>
                <p>
                  原安排：{r.snapshot.title} · {stamp(r.snapshot.start_at)} ·{" "}
                  {r.snapshot.venue}
                </p>
                <p>
                  现安排：{r.session.title} · {stamp(r.session.start_at)} ·{" "}
                  {r.session.venue}
                </p>
                {r.session.change_note && <p>{r.session.change_note}</p>}
                <details>
                  <summary>查看最新培训内容</summary>
                  {r.session.agenda.map((a, i) => (
                    <p key={i}>
                      {a.title}：{a.description}
                    </p>
                  ))}
                </details>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action("/confirm-change", r)}
                >
                  已核对，我仍可参加
                </button>
              </Message>
            )}
          {r.cancelled_at && (
            <p className="muted">取消原因：{r.cancel_reason}</p>
          )}
          <div className="button-row">
            {r.can_cancel && (
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => setCancel(r)}
              >
                取消本场报名
              </button>
            )}
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.receipt);
                  setCopied(r.id);
                } catch {
                  download("报名凭证.txt", r.receipt);
                }
              }}
            >
              {copied === r.id ? "凭证已复制" : "保存本场凭证"}
            </button>
          </div>
        </article>
      ))}
      {loaded && !rows.length && !pending.length && (
        <div className="empty">
          当前浏览器没有已确认的报名。
          <br />
          在其他设备报过名，可以导入凭证；丢失凭证请联系工作人员核对。
        </div>
      )}
      <section className="recover-box">
        <h3>在其他设备报过名？</h3>
        <form onSubmit={importToken}>
          <label>
            私密报名凭证
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="mr_…"
              autoComplete="off"
              maxLength={10000}
            />
          </label>
          <button className="button secondary" disabled={busy || !token.trim()}>
            导入并查看
          </button>
        </form>
        <p className="muted">
          只凭姓名或工号不能查询、取消别人的报名。需要协助请联系：{contact}。
        </p>
      </section>
      {!!rows.length && (
        <div className="button-row">
          <button
            className="text-button"
            onClick={() =>
              download(
                "我的全部报名凭证.txt",
                rows.map((r) => r.receipt).join("\n"),
              )
            }
          >
            保存全部凭证
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (
                confirm(
                  "仅清除此浏览器保存的凭证，不会取消报名。请先保存凭证文件。是否继续？",
                )
              ) {
                localStorage.removeItem("mentor-v2:" + space + ":receipts");
                sessionStorage.removeItem("mentor-profile:" + space);
                void refresh();
              }
            }}
          >
            清除本机凭证
          </button>
        </div>
      )}
      {cancel && (
        <Modal title="取消本场报名" onClose={() => setCancel(null)}>
          <p>
            确认取消“{cancel.session.title}
            ”吗？名额会立即释放，再次报名需重新提交。
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => setCancel(null)}
            >
              保留报名
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action("/cancel", cancel)}
            >
              确认取消报名
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
