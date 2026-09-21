import { useEffect, useState } from "react";
import type { Session } from "../shared/model";
import { stamp, localInput } from "../shared/programme";
import { api, download } from "./api";
import { Message, Modal } from "./components";
type RecordRow = {
  id: string;
  session_id: string;
  name: string;
  department: string;
  employee_id: string;
  version: number;
  created_at: number;
  cancelled_at: number | null;
  cancel_reason: string;
  session_title: string;
  start_at: number;
  end_at: number;
  venue: string;
  event_state: string;
};
export default function AdminRecords({
  sessions,
  onChanged,
}: {
  sessions: Session[];
  onChanged: () => void;
}) {
  const [sid, setSid] = useState(""),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState("active"),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<RecordRow[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<RecordRow | null>(null),
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
  async function exportList() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ records: RecordRow[] }>(
          "/admin/export-data?" + params,
        ),
        { workbook } = await import("./export");
      const data = workbook([
        [
          "姓名",
          "所属部门",
          "工号",
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
        ],
        ...r.records.map((x) => [
          x.name,
          x.department,
          x.employee_id,
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
        ]),
      ]);
      download(
        "生活导师报名名单-" + new Date().toISOString().slice(0, 10) + ".xlsx",
        data as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
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
          onClick={() => void exportList()}
          disabled={busy}
        >
          导出筛选名单
        </button>
      </div>
      {error && !edit && !cancel && <Message>{error}</Message>}
      <p className="muted">
        共 {total} 条。名单导出为
        Excel，工号前导0保留。活动取消、归档与个人报名取消分别记录。
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>姓名 / 工号</th>
              <th>部门</th>
              <th>场次</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  {r.employee_id}
                </td>
                <td>{r.department}</td>
                <td>
                  {stamp(r.start_at)}
                  <br />
                  {r.session_title}
                </td>
                <td>
                  {r.cancelled_at ? "个人已取消" : "有效"}
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
          onClose={() => {
            setEdit(null);
            setCancel(null);
          }}
        >
          <form className="editor-form" onSubmit={save}>
            {edit ? (
              <>
                {(["name", "department", "employee_id"] as const).map(
                  (k, i) => (
                    <label key={k}>
                      {["姓名", "部门", "工号"][i]}
                      <input
                        required
                        value={edit[k]}
                        maxLength={k === "department" ? 120 : 80}
                        onChange={(e) =>
                          setEdit({ ...edit, [k]: e.target.value })
                        }
                      />
                    </label>
                  ),
                )}
                <p className="muted">
                  更正保留报名编号和原凭证；同一工号不能在本场重复报名。
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
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && <Message>{error}</Message>}
            <button className="button primary" disabled={busy}>
              {busy ? "正在处理…" : "确认保存"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
