import { useEffect, useState } from "react";
import type { Session } from "../shared/model";
import { stamp, localInput } from "../shared/programme";
import { api, download } from "./api";
import { Message, Modal } from "./components";
import { BusyButton } from "./motion";
import ManualEntry, { type AttendanceRow } from "./ManualEntry";
export default function AdminAttendance({
  sessions,
  formal,
  initialSession = "",
}: {
  sessions: Session[];
  formal: boolean;
  initialSession?: string;
}) {
  const [sid, setSid] = useState(initialSession),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState("active"),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<AttendanceRow[]>([]),
    [total, setTotal] = useState(0),
    [loadedParams, setLoadedParams] = useState<string | null>(null),
    [nonce, setNonce] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [add, setAdd] = useState(false),
    [edit, setEdit] = useState<AttendanceRow>(),
    [cancel, setCancel] = useState<AttendanceRow>(),
    [reason, setReason] = useState("");
  const params = new URLSearchParams({
    history: "1",
    session: sid,
    q: query,
    state,
    page: String(page),
  }).toString();
  useEffect(() => {
    let live = true;
    setBusy(true);
    api<{ records: AttendanceRow[]; total: number }>(
      "/admin/attendance?" + params,
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
  async function exportRows() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ records: AttendanceRow[] }>(
          "/admin/attendance-export?" + params,
        ),
        { workbook } = await import("./export");
      const time = (n: number) => localInput(n).replace("T", " ");
      download(
        "生活导师原始参会补记依据_非最新考勤-" +
          new Date().toISOString().slice(0, 10) +
          ".xlsx",
        workbook([
          [
            "姓名",
            "所属部门",
            "工号",
            "联系邮箱",
            "场次",
            "开始时间（北京时间）",
            "结束时间",
            "地点",
            "当前是否有有效报名",
            "补记状态",
            "到场确认人（工作人员填写）",
            "确认依据",
            "录入时间",
            "最后更正时间",
            "撤销原因",
            "记录编号",
            "场次编号",
            "统计说明",
          ],
          ...r.records.map((x) => [
            x.name,
            x.department,
            x.employee_id,
            x.email,
            x.session_title,
            time(x.start_at),
            time(x.end_at),
            x.venue,
            x.has_registration ? "有" : "无",
            x.cancelled_at ? "已撤销" : "原始到场补记（以最新核对为准）",
            x.confirmed_by,
            x.confirmation_note,
            time(x.created_at),
            time(x.updated_at),
            x.cancel_reason,
            x.id,
            x.session_id,
            "原始补记依据，可能已被后续核对修正；最新考勤请使用参会核对导出",
          ]),
        ]) as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function undo(e: React.FormEvent) {
    e.preventDefault();
    if (!cancel) return;
    setBusy(true);
    setError("");
    try {
      await api("/admin/attendance/" + cancel.id + "/cancel", {
        version: cancel.version,
        reason,
      });
      setCancel(undefined);
      setNonce((n) => n + 1);
      setMessage("参会补记已撤销，原记录和原因保留；报名名单未改变。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <p className="muted">
        这里只记录工作人员已核实的实际到场情况，包括未通过网站报名的老师。参会补记与报名名单独立，不占用名额，不计入报名次数；未补记不代表缺席。
      </p>
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
          补记状态
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">有效补记</option>
            <option value="cancelled">已撤销</option>
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
          disabled={busy}
          onClick={() => setAdd(true)}
        >
          新增参会补记
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setNonce((n) => n + 1)}
        >
          刷新名单
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportRows()}
        >
          导出原补记依据
        </button>
      </div>
      {message && <Message success>{message}</Message>}
      {error && !cancel && <Message>{error}</Message>}
      <p className="muted">
        {loadedParams === params
          ? `当前筛选共 ${total} 条；`
          : busy
            ? "正在读取当前筛选名单…"
            : "尚未读取当前筛选名单，请重试。"}
        导出包含全部筛选结果。
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>姓名 / 工号</th>
              <th>部门 / 邮箱</th>
              <th>场次</th>
              <th>确认依据</th>
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
                  {r.email || "未填写邮箱"}
                </td>
                <td>
                  {stamp(r.start_at)}
                  <br />
                  {r.session_title}
                </td>
                <td>
                  {r.confirmed_by}
                  <br />
                  {r.confirmation_note}
                  <small>{stamp(r.created_at)} 录入</small>
                </td>
                <td>
                  {r.cancelled_at ? "已撤销" : "原始到场补记"}
                  <br />
                  {r.has_registration ? "当前有有效报名" : "当前无有效报名"}
                </td>
                <td>
                  {!r.cancelled_at && (
                    <div className="button-row">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setEdit(r)}
                      >
                        更正补记
                      </button>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => {
                          setCancel(r);
                          setReason("");
                          setError("");
                        }}
                      >
                        撤销补记
                      </button>
                    </div>
                  )}
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
      {(add || edit) && (
        <ManualEntry
          formal={formal}
          sessions={sessions}
          initialSession={sid}
          attendance
          edit={edit}
          onClose={() => {
            setAdd(false);
            setEdit(undefined);
          }}
          onSaved={(id) => {
            setAdd(false);
            setEdit(undefined);
            setSid(id);
            setQ("");
            setQuery("");
            setState("active");
            setPage(1);
            setNonce((n) => n + 1);
            setMessage("参会补记已保存；没有新增报名或改变名额。");
          }}
        />
      )}
      {cancel && (
        <Modal
          title="撤销参会补记"
          closeDisabled={busy}
          onClose={() => {
            if (!busy) setCancel(undefined);
          }}
        >
          <form className="editor-form" onSubmit={undo}>
            <p>
              撤销 {cancel.name} 的“{cancel.session_title}
              ”参会补记。保留记录，不影响报名。
            </p>
            <label>
              撤销原因
              <textarea
                required
                maxLength={500}
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && <Message focusOnMount>{error}</Message>}
            <BusyButton busy={busy} pendingLabel="正在保存…">
              确认撤销补记
            </BusyButton>
          </form>
        </Modal>
      )}
    </section>
  );
}
