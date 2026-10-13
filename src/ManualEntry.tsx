import { EmployeeField, EmailField } from "./IdentityFields";
import { useRef, useState } from "react";
import type { Session } from "../shared/model";
import { stamp } from "../shared/programme";
import { api, ApiError } from "./api";
import { Message, Modal } from "./components";
import { BusyButton } from "./motion";

export type AttendanceRow = {
  id: string;
  session_id: string;
  name: string;
  department: string;
  employee_id: string;
  email: string;
  confirmed_by: string;
  confirmation_note: string;
  version: number;
  created_at: number;
  updated_at: number;
  cancelled_at: number | null;
  cancel_reason: string;
  session_title: string;
  start_at: number;
  end_at: number;
  venue: string;
  event_state: string;
  has_registration: number;
};
export default function ManualEntry({
  sessions,
  formal,
  initialSession = "",
  attendance = false,
  edit,
  onClose,
  onSaved,
}: {
  sessions: Session[];
  formal: boolean;
  initialSession?: string;
  attendance?: boolean;
  edit?: AttendanceRow;
  onClose: () => void;
  onSaved: (sid: string) => void;
}) {
  const [sid, setSid] = useState(edit?.session_id || initialSession),
    [name, setName] = useState(edit?.name || ""),
    [department, setDepartment] = useState(edit?.department || ""),
    [employeeId, setEmployeeId] = useState(edit?.employee_id || ""),
    [email, setEmail] = useState(edit?.email || ""),
    [operator, setOperator] = useState(edit?.confirmed_by || ""),
    [note, setNote] = useState(edit?.confirmation_note || ""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ key: "", id: crypto.randomUUID() });
  const session = sessions.find((s) => s.id === sid),
    now = Date.now() / 1000;
  const eligible =
    !!session &&
    (attendance
      ? ["published", "paused", "archived"].includes(session.state) &&
        session.start_at <= now
      : ["published", "paused"].includes(session.state) &&
        session.end_at > now &&
        session.remaining > 0);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !session) return;
    setBusy(true);
    setError("");
    const payload = {
      sessionId: sid,
      sessionVersion: session.version,
      name,
      department,
      employeeId,
      email,
      operator,
      note,
      confirmed,
      ...(edit ? { version: edit.version } : {}),
    };
    const key = JSON.stringify(payload);
    if (attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      const result = await api<{ cancelled?: boolean }>(
        edit
          ? "/admin/attendance/" + edit.id
          : attendance
            ? "/admin/attendance"
            : "/admin/registrations",
        { ...payload, requestId: attempt.current.id },
        edit ? "PATCH" : "POST",
      );
      if (result.cancelled) {
        setError("这次提交已存在，但记录随后被撤销。请关闭表单核对名单。");
        return;
      }
      onSaved(sid);
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.code === "NETWORK"
          ? "连接中断，结果待核对。可重试相同内容，系统不会重复增加；也可关闭后到名单中核对。"
          : err.code === "SESSION_FULL"
            ? "本场名额已满。请先在场次管理中核对并调整容量，再补报名。"
            : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      closeDisabled={busy}
      title={
        edit
          ? "更正参会补记"
          : attendance
            ? "参会补记（已确认到场）"
            : "工作人员补报名"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="editor-form" onSubmit={save}>
        <label>
          补录场次
          <select
            required
            value={sid}
            disabled={busy || !!edit}
            onChange={(e) => {
              setSid(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">请选择场次</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {stamp(s.start_at)} · {s.title}
              </option>
            ))}
          </select>
        </label>
        {session && (
          <p className="muted">
            {session.title} · {stamp(session.start_at)}—{stamp(session.end_at)}
            <br />
            {session.venue} · 已报名 {session.booked} / {session.capacity} 人
            <br />
            报名截止：{stamp(session.deadline_at)}
          </p>
        )}
        <p className="muted">
          {attendance
            ? "仅在已核实老师实际到场后登记；不新增报名、不占用报名名额，也不计入报名次数。"
            : "可以在公众报名截止后补录，仍检查重复工号、名额和每人可报场数。活动结束后，请改用参会补记。补报名不代表实际出席。"}
        </p>
        {session && !eligible && !edit && (
          <Message>
            {attendance
              ? "当前场次尚未开始或状态不允许参会补记。"
              : "当前场次已结束、名额已满或状态不允许补报名，请先核对场次。"}
          </Message>
        )}
        <label>
          姓名
          <input
            required
            maxLength={80}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          所属部门
          <input
            required
            maxLength={120}
            value={department}
            disabled={busy}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>
        <EmployeeField
          formal={formal}
          value={employeeId}
          onChange={setEmployeeId}
          disabled={busy}
        />
        <EmailField
          formal={formal}
          value={email}
          onChange={setEmail}
          disabled={busy}
          required={!attendance}
        />
        <label>
          {attendance ? "到场确认人" : "经办人"}
          <input
            required
            maxLength={80}
            value={operator}
            disabled={busy}
            onChange={(e) => setOperator(e.target.value)}
          />
        </label>
        <label>
          {attendance ? "到场确认依据" : "补录原因"}
          <textarea
            required
            maxLength={500}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              attendance
                ? "例如：经现场工作人员核对，确认本人参加本场活动。"
                : "例如：截止后由工作人员收到老师的报名资料，协助补录。"
            }
          />
        </label>
        <p className="muted">请填写实际经办人或到场确认人，方便后续核对。</p>
        <label className="check-label">
          <input
            type="checkbox"
            required
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {attendance
            ? "我已核对场次和人员，并确认其实际到场。"
            : "我已核对场次、人员信息和补录原因，确认代为报名。"}
        </label>
        {error && <Message focusOnMount>{error}</Message>}
        <BusyButton
          className="button primary"
          busy={busy}
          pendingLabel="正在保存…"
          disabled={busy || !confirmed || (!edit && !eligible)}
        >
          {edit ? "保存更正" : attendance ? "确认参会补记" : "确认补报名"}
        </BusyButton>
      </form>
    </Modal>
  );
}
