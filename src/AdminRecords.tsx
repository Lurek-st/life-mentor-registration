import { EmployeeField, EmailField } from "./IdentityFields";
import { useEffect, useState } from "react";
import type { Session } from "../shared/model";
import { stamp, localInput } from "../shared/programme";
import { api, download } from "./api";
import { Message, Modal } from "./components";
import { BusyButton } from "./motion";
import EmailNotice from "./EmailNotice";
import ManualEntry from "./ManualEntry";
import type { ReviewData } from "../shared/attendance";
import { attendanceRows, safeFile, timeText } from "./attendanceExport";
type RecordRow = {
  id: string;
  session_id: string;
  name: string;
  department: string;
  employee_id: string;
  email: string;
  version: number;
  created_at: number;
  cancelled_at: number | null;
  cancel_reason: string;
  session_title: string;
  start_at: number;
  end_at: number;
  venue: string;
  event_state: string;
  source: string;
  recorded_by: string;
  staff_note: string;
};
export default function AdminRecords({
  sessions,
  formal,
  onChanged,
}: {
  sessions: Session[];
  formal: boolean;
  onChanged: () => void;
}) {
  const [sid, setSid] = useState(""),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState("active"),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<RecordRow[]>([]),
    [total, setTotal] = useState(0),
    [loadedParams, setLoadedParams] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(""),
    [edit, setEdit] = useState<RecordRow | null>(null),
    [mail, setMail] = useState(false),
    [add, setAdd] = useState(false),
    [message, setMessage] = useState(""),
    [cancel, setCancel] = useState<RecordRow | null>(null),
    [reason, setReason] = useState(""),
    [nonce, setNonce] = useState(0);
  const params = new URLSearchParams({
    session: sid,
    q: query,
    state,
    page: String(page),
  }).toString();
  useEffect(() => {
    let live = true;
    setBusy(true);
    api<{ records: RecordRow[]; total: number }>(
      "/admin/registrations?" + params,
    )
      .then((r) => {
        if (live) {
          setRows(r.records);
          setTotal(r.total);
          setLoadedParams(params);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [params, nonce]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (cancel)
        await api("/admin/registrations/" + cancel.id + "/cancel", {
          version: cancel.version,
          reason,
        });
      else if (edit)
        await api(
          "/admin/registrations/" + edit.id,
          {
            version: edit.version,
            name: edit.name,
            department: edit.department,
            employeeId: edit.employee_id,
            email: edit.email,
          },
          "PATCH",
        );
      setEdit(null);
      setCancel(null);
      setNonce((n) => n + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportList(summary = false) {
    setExporting(summary ? "summary" : "list");
    setBusy(true);
    setError("");
    try {
      const r = await api<{ records: RecordRow[] }>(
          "/admin/export-data?" + params,
        ),
        { workbook } = await import("./export");
      const data = workbook(
        summary
          ? (await import("./registrationSummary")).registrationSummary(
              r.records,
            )
          : [
              [
                "姓名",
                "所属部门",
                "工号",
                "联系邮箱",
                "场次",
                "开始时间（北京时间）",
                "结束时间",
                "地点",
                "个人报名状态",
                "活动状态",
                "报名时间",
                "取消原因",
                "报名编号",
                "场次编号",
                "报名来源",
                "补录经办人（工作人员填写）",
                "补录原因",
              ],
              ...r.records.map((x) => [
                x.name,
                x.department,
                x.employee_id,
                x.email,
                x.session_title,
                localInput(x.start_at).replace("T", " "),
                localInput(x.end_at).replace("T", " "),
                x.venue,
                x.cancelled_at ? "已取消" : "有效",
                (
                  {
                    published: "开放",
                    paused: "暂停",
                    cancelled: "活动取消",
                    archived: "归档",
                    draft: "草稿",
                  } as Record<string, string>
                )[x.event_state],
                localInput(x.created_at).replace("T", " "),
                x.cancel_reason,
                x.id,
                x.session_id,
                x.source === "staff" ? "工作人员补报名" : "自主报名",
                x.recorded_by,
                x.staff_note,
              ]),
            ],
      );
      download(
        (summary ? "生活导师报名次数汇总-" : "生活导师报名名单-") +
          new Date().toISOString().slice(0, 10) +
          ".xlsx",
        data as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setExporting("");
    }
  }
  async function exportCombined() {
    if (!sid) return;
    setExporting("combined");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api<ReviewData>(
        "/admin/combined-export?format=review&session=" +
          encodeURIComponent(sid),
      );
      const { workbook } = await import("./export");
      download(
        safeFile(
          timeText(data.session.start_at).slice(0, 10) +
            "_" +
            data.session.title +
            "_报名及参会核对总名单",
        ) + ".xlsx",
        workbook(attendanceRows(data), {
          sheetName: "本场总名单",
        }) as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setMessage(
        `${data.session.title}：本场 ${data.people.length} 人的总名单已生成，包含最新签到核对结果。总人数不等于实际到场人数。`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setExporting("");
    }
  }
  return (
    <section>
      {message && <Message success>{message}</Message>}
      <div className="combined-export-bar">
        <div>
          <strong>本场总名单</strong>
          <p>
            先选择一场活动，导出本场报名、补记和最新参会核对结果，含取消报名历史，按工号去重。不受搜索、状态筛选或分页影响；总人数不等于实际到场人数。
          </p>
        </div>
        <BusyButton
          className="button primary"
          busy={busy && exporting === "combined"}
          pendingLabel="正在导出…"
          onClick={() => void exportCombined()}
          disabled={busy || !sid}
        >
          导出本场总名单
        </BusyButton>
      </div>
      <div className="records-toolbar">
        <label>
          培训场次
          <select
            value={sid}
            onChange={(e) => {
              setSid(e.target.value);
              setPage(1);
            }}
          >
            <option value="">所有场次</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {stamp(s.start_at)} {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          个人报名状态
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">有效报名</option>
            <option value="cancelled">已取消</option>
            <option value="all">全部记录</option>
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q);
            setPage(1);
          }}
        >
          <label>
            姓名、部门或工号
            <input
              maxLength={120}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button className="button secondary">搜索</button>
        </form>
        <button
          className="button primary"
          onClick={() => setAdd(true)}
          disabled={busy}
        >
          工作人员补报名
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setNonce((n) => n + 1)}
        >
          刷新名单
        </button>
        <BusyButton
          className="button primary"
          busy={busy && exporting === "list"}
          pendingLabel="正在导出…"
          onClick={() => void exportList()}
          disabled={busy}
        >
          导出筛选名单
        </BusyButton>
        <BusyButton
          className="button secondary"
          busy={busy && exporting === "summary"}
          pendingLabel="正在导出…"
          disabled={busy}
          onClick={() => void exportList(true)}
        >
          导出报名次数汇总
        </BusyButton>
        <button
          className="button secondary"
          disabled={busy || !sid}
          onClick={() => setMail(true)}
        >
          准备邮件提醒
        </button>
      </div>
      {error && !edit && !cancel && <Message>{error}</Message>}
      <p className="muted">
        {loadedParams === params
          ? `共 ${total} 条。`
          : busy
            ? "正在读取当前筛选名单…"
            : "尚未读取当前筛选名单，请重试。"}
        名单导出为 Excel，工号前导0保留。活动取消、归档与个人报名取消分别记录。
        汇总按工号统计当前筛选范围，报名次数不等于实际出席。准备邮件提醒前，请先选择一个场次。
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>姓名 / 工号</th>
              <th>部门 / 联系邮箱</th>
              <th>场次</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(loadedParams === params ? rows : []).map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  {r.employee_id}
                </td>
                <td>
                  {r.department}
                  <br />
                  <span className="contact-email">
                    {r.email || "未填写邮箱"}
                  </span>
                </td>
                <td>
                  {stamp(r.start_at)}
                  <br />
                  {r.session_title}
                </td>
                <td>
                  {r.cancelled_at ? "个人已取消" : "有效"}
                  <small>
                    {r.source === "staff" ? "工作人员补报名" : "自主报名"}
                  </small>
                  {r.source === "staff" && (
                    <small>
                      {r.recorded_by} · {r.staff_note}
                    </small>
                  )}
                  {["cancelled", "archived"].includes(r.event_state) && (
                    <small>
                      {" "}
                      · 活动{r.event_state === "cancelled" ? "取消" : "归档"}
                    </small>
                  )}
                </td>
                <td>
                  <div className="button-row">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setEdit({ ...r });
                        setError("");
                      }}
                    >
                      纠错
                    </button>
                    {!r.cancelled_at && (
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => {
                          setCancel(r);
                          setReason("");
                          setError("");
                        }}
                      >
                        取消报名
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button
          className="button secondary"
          disabled={page === 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>
          第 {page} / {Math.max(1, Math.ceil(total / 50))} 页
        </span>
        <button
          className="button secondary"
          disabled={page * 50 >= total || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
      {(edit || cancel) && (
        <Modal
          title={edit ? "更正报名信息" : "工作人员取消报名"}
          closeDisabled={busy}
          onClose={() => {
            setEdit(null);
            setCancel(null);
          }}
        >
          <form className="editor-form" onSubmit={save}>
            {edit ? (
              <>
                {(["name", "department"] as const).map((k, i) => (
                  <label key={k}>
                    {["姓名", "部门"][i]}
                    <input
                      required
                      disabled={busy}
                      value={edit[k]}
                      maxLength={k === "department" ? 120 : 80}
                      onChange={(e) =>
                        setEdit({ ...edit, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <p className="muted">
                  更正保留报名编号和原凭证；同一工号不能在本场重复报名。
                </p>
                <EmployeeField
                  formal={formal}
                  value={edit.employee_id}
                  disabled={busy}
                  onChange={(employee_id) => setEdit({ ...edit, employee_id })}
                />
                <EmailField
                  formal={formal}
                  value={edit.email}
                  disabled={busy}
                  required={false}
                  onChange={(email) => setEdit({ ...edit, email })}
                />
                <p className="muted">
                  历史报名可暂留空；未填写邮箱的记录不会列入邮件收件人。
                </p>
              </>
            ) : (
              <>
                <p>
                  取消 {cancel!.name} 的“{cancel!.session_title}
                  ”报名，释放一个名额。记录保留。
                </p>
                <label>
                  取消原因
                  <textarea
                    required
                    maxLength={500}
                    disabled={busy}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && <Message focusOnMount>{error}</Message>}
            <BusyButton busy={busy} pendingLabel="正在保存…">
              确认保存
            </BusyButton>
          </form>
        </Modal>
      )}
      {mail && (
        <EmailNotice sid={sid} query={query} onClose={() => setMail(false)} />
      )}
      {add && (
        <ManualEntry
          formal={formal}
          sessions={sessions}
          initialSession={sid}
          onClose={() => setAdd(false)}
          onSaved={(id) => {
            setAdd(false);
            setSid(id);
            setQ("");
            setQuery("");
            setState("active");
            setPage(1);
            setNonce((n) => n + 1);
            onChanged();
            setMessage("补报名已保存并计入本场名额；尚未确认实际出席。");
          }}
        />
      )}
    </section>
  );
}
