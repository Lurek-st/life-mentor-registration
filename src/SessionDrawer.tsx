import { EmployeeField, EmailField } from "./IdentityFields";
import { useLanguage } from "./language";
import { useState, useRef, useEffect } from "react";
import { Copy, CheckCircle2, Download } from "lucide-react";
import { type Session, type Snapshot } from "../shared/model";
import { timeOnly } from "../shared/programme";
import { Modal, ModalCloseButton, Message, Occupancy } from "./components";
import CalendarAction from "./CalendarAction";
import { BusyButton } from "./motion";
import {
  api,
  ApiError,
  getProfile,
  rememberProfile,
  randomHex,
  attempts,
  saveAttempt,
  download,
  type Attempt,
} from "./api";
export default function SessionDrawer({
  session: s,
  data,
  onClose,
  onChanged,
  onPrivacy,
}: {
  session: Session;
  data: Snapshot;
  onClose: () => void;
  onChanged: () => void;
  onPrivacy: () => void;
}) {
  const { tr, english, content, sessionTitle, shortDate, weekday, stamp } =
    useLanguage();
  const [profile, setProfile] = useState(() => getProfile(data.dataSpace)),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [copied, setCopied] = useState(false),
    [changed, setChanged] = useState(false);
  const pending = useRef<Attempt | null>(null),
    revision = useRef(s.content_version);
  useEffect(() => {
    if (revision.current !== s.content_version) {
      revision.current = s.content_version;
      setConsent(false);
      setChanged(true);
    }
  }, [s.content_version]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        sessionId: s.id,
        ...profile,
        contentRevision: s.content_version,
        consent: true,
      };
      const previous = attempts(data.dataSpace).find(
        (a) =>
          !a.id &&
          !a.failed &&
          a.payload &&
          Object.entries(payload).every(([k, v]) => a.payload![k] === v),
      );
      const a: Attempt = previous || {
        receipt: "mr_" + randomHex(),
        requestId: crypto.randomUUID(),
        sessionId: s.id,
        title: s.title,
        payload,
      };
      saveAttempt(data.dataSpace, a);
      pending.current = a;
      rememberProfile(data.dataSpace, profile);
      const result = await api<{ id: string; cancelled: boolean }>(
        "/register",
        { ...payload, receipt: a.receipt, requestId: a.requestId },
      );
      try {
        saveAttempt(data.dataSpace, { ...a, id: result.id });
      } catch {
        setError("报名已成功，请保存下方私密凭证。");
      }
      if (result.cancelled) {
        setError("这次报名已取消，请关闭详情后重新报名。");
        pending.current = null;
        return;
      }
      setSuccess(true);
      onChanged();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (
        pending.current &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 429
      ) {
        try {
          saveAttempt(data.dataSpace, {
            ...pending.current,
            failed: err.message,
          });
        } catch {
          /* keep original pending */
        }
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(pending.current!.receipt);
      setCopied(true);
    } catch {
      setError("复制失败，请选择凭证文字复制，或保存凭证文件。");
    }
  }
  return (
    <Modal
      title={success ? tr("报名已确认") : tr("培训场次详情")}
      dismissOnBackdrop
      closeDisabled={busy}
      focusKey={success}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="detail-heading">
        <div>
          <strong>{shortDate(s.start_at)}</strong>
          <span>
            {weekday(s.start_at)} {timeOnly(s.start_at)}—{timeOnly(s.end_at)}
          </span>
        </div>
        <div>
          <h2>{sessionTitle(s)}</h2>
          <p>{s.subjects.map(content).join(" / ")}</p>
          <p>{content(s.venue)}</p>
        </div>
      </div>
      {success ? (
        <section className="confirmation">
          <span className="success-mark" aria-hidden="true">
            <CheckCircle2 size={42} />
          </span>
          <h2>
            {data.mode === "formal" ? tr("报名成功") : tr("测试报名成功")}
          </h2>
          {error && <Message>{tr(error)}</Message>}
          <p>
            {profile.name}
            {tr("，已为你登记本场名额。")}
            <br />
            {tr("可在本浏览器的“我的报名”查看和取消。")}
          </p>
          <CalendarAction session={s} />
          <div className="receipt">
            <label>{tr("私密报名凭证 · 换设备时使用")}</label>
            <code>{pending.current?.receipt}</code>
            <div className="button-row">
              <button className="button secondary" onClick={copy}>
                <Copy size={16} />
                {copied ? tr("已复制") : tr("复制凭证")}
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(tr("我的报名凭证.txt"), pending.current!.receipt)
                }
              >
                <Download size={16} />
                {tr("保存凭证")}
              </button>
            </div>
          </div>
          <p className="muted">
            {tr(
              "本浏览器已保存凭证。请勿转发给他人；清理浏览器记录可能丢失凭证，可事先保存一份。",
            )}
          </p>
          <ModalCloseButton className="button primary full">
            {tr("返回场次列表")}
          </ModalCloseButton>
        </section>
      ) : (
        <>
          <section className="agenda">
            <h3>
              {tr("本场内容")}
              {!english && <small lang="en">Session programme</small>}
            </h3>
            {s.agenda.map((a, i) => (
              <div className="agenda-item" key={i}>
                <time>
                  {timeOnly(s.start_at + a.offset * 60)}—
                  {timeOnly(s.start_at + (a.offset + a.minutes) * 60)}
                </time>
                <div>
                  <strong>{content(a.title)}</strong>
                  {a.description && <p>{content(a.description)}</p>}
                </div>
              </div>
            ))}
          </section>
          {s.change_note && (
            <Message>
              {tr("安排说明：")}
              {content(s.change_note)}
            </Message>
          )}
          <div className="detail-status">
            <Occupancy session={s} />
            <p>
              {tr("报名截止：")}
              {stamp(s.deadline_at)}
              <br />
              <small>{tr("全部时间为北京时间")}</small>
            </p>
          </div>
          {error && (
            <Message focusOnMount>
              {tr(error)}
              {pending.current && (
                <p>
                  <a href="#mine" onClick={onClose}>
                    {tr("我的报名")}
                  </a>
                </p>
              )}
            </Message>
          )}
          {s.status === "open" && data.settings.registration_open === "true" ? (
            <form className="registration-form" onSubmit={submit}>
              <h3>
                {data.mode === "formal"
                  ? tr("填写报名信息")
                  : tr("填写测试信息")}
              </h3>
              <p className="muted">
                {tr("无需注册。请核对姓名、所属部门、工号和联系邮箱。")}
                {data.mode === "preview"
                  ? tr("测试工号须以 TEST- 开头，请勿填写真实个人资料。")
                  : ""}
              </p>
              {(["name", "department"] as const).map((k, i) => (
                <label key={k}>
                  {[tr("姓名 Name"), tr("所属部门 Department / Unit")][i]}
                  <input
                    required
                    maxLength={k === "department" ? 120 : 80}
                    value={profile[k]}
                    autoComplete={
                      k === "name"
                        ? "name"
                        : k === "department"
                          ? "organization"
                          : "off"
                    }
                    inputMode="text"
                    disabled={busy}
                    onChange={(e) => {
                      setProfile({ ...profile, [k]: e.target.value });
                      setConsent(false);
                    }}
                  />
                </label>
              ))}
              <EmployeeField
                formal={data.mode === "formal"}
                value={profile.employeeId}
                disabled={busy}
                onChange={(employeeId) => {
                  setProfile((p) => ({ ...p, employeeId }));
                  setConsent(false);
                }}
              />
              <EmailField
                formal={data.mode === "formal"}
                value={profile.email}
                disabled={busy}
                onChange={(email) => {
                  setProfile((p) => ({ ...p, email }));
                  setConsent(false);
                }}
              />
              <p className="muted">
                {tr(
                  "邮箱供工作人员发送培训通知。网站不会自动发送确认邮件；报名结果以本页提示和“我的报名”为准。",
                )}
              </p>
              {changed && (
                <Message>
                  {tr("这场活动的安排有更新，请重新核对上方内容并确认。")}
                </Message>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  {tr(
                    "我已核对信息与场次安排，确认可以参加，并知晓报名资料的使用说明。",
                  )}
                </span>
              </label>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={onPrivacy}
              >
                {tr("查看信息使用说明")}
              </button>
              <BusyButton
                className="button primary full"
                busy={busy}
                pendingLabel={tr("正在确认名额…")}
                disabled={busy || !consent}
              >
                {data.mode === "formal" ? tr("确认报名") : tr("确认测试报名")}
              </BusyButton>
              <p className="muted">
                {tr(
                  "浏览不预留名额，以提交后的确认结果为准。连接中断后可在“我的报名”核对结果。",
                )}
              </p>
            </form>
          ) : (
            <Message>
              {s.status === "full"
                ? tr("本场名额已满，请选择其他场次。")
                : s.status === "closed"
                  ? tr("本场已截止报名。")
                  : s.state === "cancelled"
                    ? tr("本场活动已取消。")
                    : tr("本场暂不接受报名。")}
            </Message>
          )}
        </>
      )}
    </Modal>
  );
}
