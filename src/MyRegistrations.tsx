import { EmailField } from "./IdentityFields";
import { useLanguage } from "./language";
import { useCallback, useEffect, useState } from "react";
import { type Booking } from "../shared/model";

import {
  api,
  ApiError,
  attempts,
  saveAttempt,
  recover,
  download,
  type Attempt,
} from "./api";
import { Message, Modal, ModalCloseButton } from "./components";
import CalendarAction from "./CalendarAction";
import { BusyButton } from "./motion";
type Mine = Booking & { receipt: string };
export default function MyRegistrations({
  space,
  formal,
  contact,
  onChanged,
}: {
  space: string;
  formal: boolean;
  contact: string;
  onChanged: () => void;
}) {
  const { tr, english, content, sessionTitle, stamp, stateLabels } =
    useLanguage();
  const [rows, setRows] = useState<Mine[]>([]),
    [pending, setPending] = useState<Attempt[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [busyKey, setBusyKey] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false),
    [token, setToken] = useState(""),
    [cancel, setCancel] = useState<Mine | null>(null),
    [emailEdit, setEmailEdit] = useState<Mine | null>(null),
    [emailDraft, setEmailDraft] = useState(""),
    [copied, setCopied] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setBusyKey((previous) => previous || "refresh");
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
      setBusyKey("");
    }
  }, [space]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function action(path: string, row: Mine) {
    setBusy(true);
    setBusyKey(path + row.id);
    setNotice("");
    setError("");
    try {
      await api(path, {
        id: row.id,
        receipt: row.receipt,
        contentRevision: row.session.content_version,
      });
      setCancel(null);
      setNotice(
        path === "/cancel" ? "本场报名已取消。" : "已保存对最新安排的确认。",
      );
      await refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setBusyKey("");
    }
  }
  async function retry(a: Attempt) {
    setBusy(true);
    setBusyKey("retry" + a.receipt);
    setNotice("");
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
      setBusyKey("");
    }
  }
  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailEdit || busy) return;
    setBusy(true);
    setBusyKey("email");
    setNotice("");
    setError("");
    try {
      await api(
        "/registration-email",
        {
          id: emailEdit.id,
          receipt: emailEdit.receipt,
          version: emailEdit.version,
          email: emailDraft,
        },
        "PATCH",
      );
      setEmailEdit(null);
      setNotice("本场联系邮箱已更新。");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setBusyKey("");
    }
  }
  async function importToken(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setNotice("");
    setError("");
    const tokens = token.match(/mr_[a-f0-9]{64}/g) || [];
    if (!tokens.length) {
      setError("请粘贴完整私密报名凭证。");
      return;
    }
    setBusy(true);
    setBusyKey("import");
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
      setBusyKey("");
    }
  }
  return (
    <section className="my-page">
      <div className="section-heading">
        <div>
          <h1>{tr("我的报名")}</h1>
          <p className="muted">{tr("本浏览器已保存的报名与最新安排")}</p>
        </div>
        <BusyButton
          className="button secondary"
          busy={busy && busyKey === "refresh"}
          pendingLabel={tr("正在核对…")}
          onClick={() => void refresh()}
          disabled={busy}
        >
          {tr("刷新结果")}
        </BusyButton>
      </div>
      {notice && (
        <Message success focusOnMount key={notice}>
          {tr(notice)}
        </Message>
      )}
      {error && !cancel && !emailEdit && (
        <Message focusOnMount>{tr(error)}</Message>
      )}
      {!loaded && !error && (
        <p className="loading">{tr("正在核对报名记录…")}</p>
      )}
      {pending.map((a) => (
        <div className="registration-card" key={a.receipt}>
          <h3>{content(a.title)}</h3>
          <Message>
            {tr(
              "上次提交尚未确认结果。已核对服务器，暂未找到记录；可以使用同一次提交重试，不会重复占位。",
            )}
          </Message>
          <BusyButton
            className="button secondary"
            busy={busy && busyKey === "retry" + a.receipt}
            pendingLabel={tr("正在核对…")}
            disabled={busy}
            onClick={() => void retry(a)}
          >
            {tr("继续核对并重试")}
          </BusyButton>
        </div>
      ))}
      {rows.map((r) => (
        <article className="registration-card" key={r.id}>
          <div className="section-heading">
            <h3>{sessionTitle(r.session)}</h3>
            <span className={"badge " + (r.cancelled_at ? "muted" : "")}>
              {r.cancelled_at
                ? tr("本人报名已取消")
                : ["cancelled", "archived", "draft"].includes(r.session.state)
                  ? stateLabels[r.session.state]
                  : tr("已报名")}
            </span>
          </div>
          <p>
            {stamp(r.session.start_at)}—{stamp(r.session.end_at)} ·{" "}
            {content(r.session.venue)}
          </p>
          <p>
            {r.name} · {r.department}
            {tr("· 工号")}
            {r.employee_id}
          </p>
          {!r.cancelled_at && r.session.state === "cancelled" && (
            <Message>
              {tr(
                "本场活动已取消，请留意工作人员后续安排。原报名记录保留；已导入日历的老师请自行删除或调整原事项。",
              )}
            </Message>
          )}
          {!r.cancelled_at &&
            r.content_changed &&
            ["published", "paused"].includes(r.session.state) && (
              <Message>
                <strong>{tr("本场安排有更新，请重新核对。")}</strong>
                <p>
                  {tr("原安排：")}
                  {content(r.snapshot.title)} · {stamp(r.snapshot.start_at)} ·{" "}
                  {content(r.snapshot.venue)}
                </p>
                <p>
                  {tr("现安排：")}
                  {sessionTitle(r.session)} · {stamp(r.session.start_at)} ·{" "}
                  {content(r.session.venue)}
                </p>
                {r.session.change_note && (
                  <p>{content(r.session.change_note)}</p>
                )}
                <details>
                  <summary>{tr("查看最新培训内容")}</summary>
                  {r.session.agenda.map((a, i) => (
                    <p key={i}>
                      {content(a.title)}：{content(a.description)}
                    </p>
                  ))}
                </details>
                <BusyButton
                  className="button secondary"
                  busy={busy && busyKey === "/confirm-change" + r.id}
                  pendingLabel={tr("正在保存…")}
                  disabled={busy}
                  onClick={() => void action("/confirm-change", r)}
                >
                  {tr("已核对，我仍可参加")}
                </BusyButton>
              </Message>
            )}
          {r.cancelled_at && (
            <p className="muted">
              {tr("取消原因：")}
              {content(r.cancel_reason)}
            </p>
          )}
          <div className="button-row">
            {!r.cancelled_at && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEmailEdit(r);
                  setEmailDraft(r.email || "");
                  setError("");
                }}
              >
                {r.email ? tr("修改联系邮箱") : tr("补填联系邮箱")}
              </button>
            )}
            {r.can_cancel && (
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setCancel(r);
                }}
              >
                {tr("取消本场报名")}
              </button>
            )}
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.receipt);
                  setCopied(r.id);
                } catch {
                  download(tr("报名凭证.txt"), r.receipt);
                }
              }}
            >
              {copied === r.id ? tr("凭证已复制") : tr("保存本场凭证")}
            </button>
          </div>
          <p className="muted contact-email">
            {tr("联系邮箱：")}
            {r.email || tr("未填写，请补填以便工作人员联系")}
          </p>
          {!r.cancelled_at && <CalendarAction session={r.session} />}
        </article>
      ))}
      {loaded && !rows.length && !pending.length && (
        <div className="empty">
          {tr("当前浏览器没有已确认的报名。")}
          <br />
          {tr("在其他设备报过名，可以导入凭证；丢失凭证请联系工作人员核对。")}
        </div>
      )}
      <section className="recover-box">
        <h3>{tr("在其他设备报过名？")}</h3>
        <form onSubmit={importToken}>
          <label>
            {tr("私密报名凭证")}
            <textarea
              disabled={busy}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="mr_…"
              autoComplete="off"
              maxLength={10000}
            />
          </label>
          <BusyButton
            className="button secondary"
            busy={busy && busyKey === "import"}
            pendingLabel={tr("正在核对…")}
            disabled={busy || !token.trim()}
          >
            {tr("导入并查看")}
          </BusyButton>
        </form>
        <p className="muted">
          {tr("只凭姓名或工号不能查询、取消别人的报名。需要协助请联系：")}
          {content(contact)}
          {english ? "." : "。"}
        </p>
      </section>
      {(!!rows.length || attempts(space).length > 0) && (
        <div className="button-row">
          {!!rows.length && (
            <button
              className="text-button"
              onClick={() =>
                download(
                  tr("我的全部报名凭证.txt"),
                  rows.map((r) => r.receipt).join("\n"),
                )
              }
            >
              {tr("保存全部凭证")}
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  tr(
                    "仅清除此浏览器保存的凭证与待确认提交，不会取消服务器上的报名。请先保存凭证；尚未确认的提交清除后需联系工作人员核对。是否继续？",
                  ),
                )
              ) {
                try {
                  localStorage.removeItem("mentor-v2:" + space + ":receipts");
                  sessionStorage.removeItem("mentor-profile:" + space);
                  setRows([]);
                  setPending([]);
                  setToken("");
                  setError("");
                  setLoaded(true);
                } catch {
                  setError(
                    tr("浏览器未允许清除，请在浏览器设置中清除本站数据。"),
                  );
                }
              }
            }}
          >
            {tr("清除本机凭证")}
          </button>
        </div>
      )}
      {cancel && (
        <Modal
          title={tr("取消本场报名")}
          closeDisabled={busy}
          onClose={() => {
            if (!busy) setCancel(null);
          }}
        >
          <p>
            {tr("确认取消“")}
            {sessionTitle(cancel.session)}
            {tr("”吗？名额会立即释放，再次报名需重新提交。")}
          </p>
          {error && <Message focusOnMount>{tr(error)}</Message>}
          <div className="button-row">
            <ModalCloseButton className="button secondary" disabled={busy}>
              {tr("保留报名")}
            </ModalCloseButton>
            <BusyButton
              className="button primary"
              busy={busy}
              pendingLabel={tr("正在取消…")}
              disabled={busy}
              onClick={() => void action("/cancel", cancel)}
            >
              {tr("确认取消报名")}
            </BusyButton>
          </div>
        </Modal>
      )}
      {emailEdit && (
        <Modal
          title={tr("更新本场联系邮箱")}
          closeDisabled={busy}
          onClose={() => {
            if (!busy) setEmailEdit(null);
          }}
        >
          <form className="editor-form" onSubmit={saveEmail}>
            <p>
              {tr("仅更新“")}
              {sessionTitle(emailEdit.session)}
              {tr("”这条报名。其他场次的邮箱请分别核对。")}
            </p>
            <EmailField
              formal={formal}
              value={emailDraft}
              onChange={setEmailDraft}
              disabled={busy}
            />
            {error && <Message focusOnMount>{tr(error)}</Message>}
            <BusyButton
              className="button primary"
              busy={busy}
              pendingLabel={tr("正在保存…")}
            >
              {tr("保存联系邮箱")}
            </BusyButton>
          </form>
        </Modal>
      )}
    </section>
  );
}
