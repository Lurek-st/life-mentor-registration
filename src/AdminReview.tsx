import { useEffect, useRef, useState } from "react";
import { normalizeEmployee, type Session, type Round } from "../shared/model";
import {
  outcomeLabels,
  type Outcome,
  type ReviewData,
  type TermData,
} from "../shared/attendance";
import { stamp } from "../shared/programme";
import { api, ApiError, download } from "./api";
import { Message, Modal } from "./components";
import { BusyButton } from "./motion";
import ManualEntry from "./ManualEntry";
import AdminAttendance from "./AdminAttendance";
import {
  attendanceRows,
  safeFile,
  timeText,
  termSheets,
} from "./attendanceExport";

export default function AdminReview({
  sessions,
  formal,
  rounds,
}: {
  sessions: Session[];
  formal: boolean;
  rounds: Round[];
}) {
  const recent = [...sessions]
    .filter((s) => s.start_at < Date.now() / 1000)
    .sort((a, b) => b.start_at - a.start_at)[0];
  const [sid, setSid] = useState(recent?.id || sessions[0]?.id || ""),
    [data, setData] = useState<ReviewData | null>(null),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [exportingOne, setExportingOne] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<Outcome | null>(null),
    [operator, setOperator] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [add, setAdd] = useState(false),
    [legacy, setLegacy] = useState(false),
    [history, setHistory] = useState<any[] | null>(null);
  const [paste, setPaste] = useState(""),
    [matchMessage, setMatchMessage] = useState(""),
    [showTerm, setShowTerm] = useState(false),
    [scope, setScope] = useState<string[]>(sessions.map((s) => s.id));
  const attempt = useRef({ key: "", id: "" }),
    [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setData(null);
    setSelected([]);
    setError("");
    setMatchMessage("");
    setPaste("");
    if (!sid) {
      setLoading(false);
      return;
    }
    api<ReviewData>(
      "/admin/attendance-review?session=" + encodeURIComponent(sid),
    )
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [sid, nonce]);
  const people = data?.people || [],
    visible = people.filter(
      (p) =>
        (filter === "all" ||
          p.outcome === filter ||
          (filter === "review" && p.needsReview)) &&
        (!query ||
          [p.employee_id, p.name, p.department].some((x) =>
            x.toLowerCase().includes(query.toLowerCase()),
          )),
    );
  const disabled = busy || loading || uncertain;
  function refresh() {
    setNonce((n) => n + 1);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !action) return;
    setBusy(true);
    setError("");
    const payload = {
        sessionId: sid,
        revision: data.revision,
        operator,
        note,
        confirmed,
        entries: selected.map((employeeId) => ({
          employeeId,
          outcome: action,
        })),
      },
      key = JSON.stringify(payload);
    if (attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      const r = await api<{ count: number }>("/admin/attendance-review", {
        ...payload,
        requestId: attempt.current.id,
      });
      setAction(null);
      setNote("");
      setSelected([]);
      setMessage(
        `已保存 ${r.count} 人的“${outcomeLabels[action]}”。报名和名额未改变。`,
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
      if ((e as ApiError).code === "NETWORK" || (e as ApiError).status >= 500)
        setUncertain(true);
      else if ((e as ApiError).status === 409) {
        setAction(null);
        refresh();
        setMessage((e as Error).message + " 请核对后重新勾选；本次未保存。");
      }
    } finally {
      setBusy(false);
    }
  }
  async function checkResult() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ saved: boolean; batch?: { count: number } }>(
        "/admin/attendance-batch?id=" + attempt.current.id,
      );
      setUncertain(false);
      if (r.saved) {
        setAction(null);
        setMessage(
          `已核实：上次 ${r.batch?.count} 人的修改已保存，无需重复提交。`,
        );
        refresh();
      } else
        setMessage(
          "暂未查到上次保存记录。请点击确认保存重试；系统会防止同一操作重复保存。",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function matchIds() {
    const ids = [
      ...new Set(
        paste
          .split(/[\s,，;；]+/)
          .map(normalizeEmployee)
          .filter(Boolean),
      ),
    ];
    if (ids.length > 500) {
      setMatchMessage("一次最多匹配500个工号，请分批核对。");
      return;
    }
    const found = ids.filter((id) => people.some((p) => p.employee_id === id)),
      missing = ids.filter((id) => !found.includes(id));
    setSelected(found);
    setFilter("all");
    setQuery("");
    setMatchMessage(
      `已勾选 ${found.length} 人，尚未保存。${missing.length ? "未找到：" + missing.join("、") + "。请检查工号；未报名到场者请补录。" : ""}`,
    );
  }
  async function exportOne() {
    if (!sid) return;
    setExportingOne(true);
    setBusy(true);
    setError("");
    try {
      const d = await api<ReviewData>(
          "/admin/attendance-review?session=" + encodeURIComponent(sid),
        ),
        { workbook } = await import("./export");
      download(
        safeFile(
          timeText(d.session.start_at).slice(0, 10) +
            "_" +
            d.session.title +
            "_报名及参会核对总名单",
        ) + ".xlsx",
        workbook(attendanceRows(d), { sheetName: "本场总名单" }) as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setMessage("本场全部名单已导出，包含最新参会状态；不受搜索和筛选影响。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setExportingOne(false);
    }
  }
  async function exportTerm() {
    setBusy(true);
    setError("");
    try {
      const d = await api<TermData>(
          "/admin/attendance-term?sessions=" +
            encodeURIComponent(scope.join(",")),
        ),
        { multiWorkbook } = await import("./export");
      download(
        "生活导师_所选" +
          d.events.length +
          "场_参会汇总_" +
          timeText(d.generatedAt).slice(0, 10) +
          ".xlsx",
        multiWorkbook(termSheets(d)) as BlobPart,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setMessage(
        `已导出所选 ${d.events.length} 场的人员汇总和逐场明细。待核对不等于未到场。`,
      );
      setShowTerm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ records: any[] }>(
        "/admin/audit?target=" + encodeURIComponent(sid),
      );
      setHistory(r.records.filter((x) => x.action === "attendance.review"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (legacy)
    return (
      <section>
        <button
          className="button secondary"
          onClick={() => {
            setLegacy(false);
            refresh();
          }}
        >
          返回参会核对
        </button>
        <Message>
          以下是原始补记依据及更正入口，可能已被后续核对修正。当前参会结论和统计请回到“参会核对”查看。
        </Message>
        <AdminAttendance
          sessions={sessions}
          initialSession={sid}
          formal={formal}
        />
      </section>
    );
  return (
    <section className="attendance-review">
      <div className="review-heading">
        <div>
          <h2>参会核对</h2>
          <p>选择活动 → 对照签到表勾选 → 标记并保存。未勾选的人保持原状态。</p>
        </div>
        <button
          className="button secondary"
          disabled={disabled}
          onClick={() => setShowTerm(true)}
        >
          学期汇总导出
        </button>
      </div>
      {message && <Message success>{message}</Message>}
      {error && <Message>{error}</Message>}
      <div className="filters">
        <label>
          培训场次
          <select
            aria-label="培训场次"
            value={sid}
            disabled={disabled}
            onChange={(e) => {
              setSid(e.target.value);
              setMessage("");
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {stamp(s.start_at)} · {s.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={disabled}
          onClick={refresh}
        >
          刷新名单
        </button>
        <BusyButton
          className="button secondary"
          disabled={disabled || !data}
          busy={exportingOne}
          pendingLabel="正在导出…"
          onClick={exportOne}
        >
          导出本场总名单
        </BusyButton>
      </div>
      {loading && <p className="loading">正在读取名单…</p>}
      {data && (
        <>
          <div className="review-counts">
            <span>
              有效报名 <b>{people.filter((p) => p.registered).length}</b>
            </span>
            {(["present", "absent", "unknown"] as Outcome[]).map((o) => (
              <span key={o}>
                {outcomeLabels[o]}{" "}
                <b>
                  {
                    people.filter(
                      (p) =>
                        p.outcome === o &&
                        (p.registered || p.legacyPresent || p.check),
                    ).length
                  }
                </b>
              </span>
            ))}
          </div>
          <p className="muted">
            报名不等于到场。已取消报名的历史人员仍可查阅，不自动计为缺席。
            {data.session.end_at > data.generatedAt
              ? "本场尚未结束，暂不能标记未到场。"
              : ""}
          </p>
          <div className="filters">
            <label>
              姓名、工号或部门
              <input
                value={query}
                disabled={disabled}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected([]);
                }}
              />
            </label>
            <label>
              参会状态
              <select
                aria-label="参会状态"
                value={filter}
                disabled={disabled}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="all">全部</option>
                {Object.entries(outcomeLabels).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
                <option value="review">需重新核实</option>
              </select>
            </label>
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => setAdd(true)}
            >
              补录未报名到场人员
            </button>
          </div>
          <details className="review-paste">
            <summary>从 Excel 粘贴工号，快速勾选</summary>
            <p>
              只复制工号列，不含表头；一行一个工号。匹配后还需要标记并保存，不会自动判定其他人未到场。
            </p>
            <textarea
              aria-label="工号列表"
              value={paste}
              disabled={disabled}
              maxLength={45000}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button
              className="button secondary"
              disabled={disabled || !paste.trim()}
              onClick={matchIds}
            >
              匹配并勾选
            </button>
            {matchMessage && <p role="status">{matchMessage}</p>}
          </details>
          <div className="review-actions">
            <strong>已选 {selected.length} 人</strong>
            {(["present", "absent", "unknown"] as Outcome[]).map((o) => (
              <button
                key={o}
                className={
                  "button " + (o === "present" ? "primary" : "secondary")
                }
                disabled={
                  disabled ||
                  !selected.length ||
                  (o === "absent" && data.session.end_at > data.generatedAt)
                }
                onClick={() => {
                  setAction(o);
                  setConfirmed(false);
                  setError("");
                }}
              >
                {o === "unknown" ? "恢复待核对" : "标记" + outcomeLabels[o]}
              </button>
            ))}
          </div>
          <p className="review-mobile-hint">
            手机上可左右滑动名单，查看参会状态和核对依据。
          </p>
          <div className="table-wrap">
            <table className="records-table review-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择当前筛选的全部人员"
                      disabled={disabled || !visible.length}
                      checked={
                        !!visible.length &&
                        visible.every((p) => selected.includes(p.employee_id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? visible.map((p) => p.employee_id)
                            : [],
                        )
                      }
                    />
                  </th>
                  <th>姓名 / 工号</th>
                  <th>部门 / 邮箱</th>
                  <th>报名情况</th>
                  <th>参会情况</th>
                  <th>核对依据</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.employee_id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"选择 " + p.name + " " + p.employee_id}
                        disabled={disabled}
                        checked={selected.includes(p.employee_id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, p.employee_id]
                              : s.filter((x) => x !== p.employee_id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {p.name}
                      <small>{p.employee_id}</small>
                    </td>
                    <td>
                      {p.department}
                      <small>{p.email}</small>
                    </td>
                    <td>
                      {p.registered
                        ? "有效报名"
                        : p.cancelledRegistration
                          ? "已取消报名"
                          : "未报名"}
                    </td>
                    <td>
                      <strong>{outcomeLabels[p.outcome]}</strong>
                      {p.conflict && (
                        <small className="review-warning">
                          {p.conflict}
                          {p.storedOutcome
                            ? "（原结论：" +
                              outcomeLabels[p.storedOutcome] +
                              "）"
                            : ""}
                        </small>
                      )}
                    </td>
                    <td>
                      {p.operator && (
                        <small>
                          {p.operator} · {timeText(p.checked_at)}
                        </small>
                      )}
                      {p.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && <p>没有符合条件的人员。</p>}
          <div className="button-row">
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => setLegacy(true)}
            >
              原补记资料更正 / 撤销
            </button>
            <button
              className="text-button"
              disabled={disabled}
              onClick={showHistory}
            >
              查看本场核对记录
            </button>
          </div>
        </>
      )}
      {add && (
        <ManualEntry
          formal={formal}
          sessions={
            data
              ? sessions.map((s) => (s.id === sid ? data.session : s))
              : sessions
          }
          initialSession={sid}
          attendance
          onClose={() => setAdd(false)}
          onSaved={() => {
            setAdd(false);
            setMessage("到场补记已保存；未新增报名或占用名额。");
            refresh();
          }}
        />
      )}
      {action && data && (
        <Modal
          closeDisabled={busy || uncertain}
          title={
            "确认" +
            (action === "unknown" ? "恢复待核对" : outcomeLabels[action])
          }
          onClose={() => {
            if (!busy && !uncertain) setAction(null);
          }}
        >
          <form className="editor-form" onSubmit={save}>
            <p>
              {data.session.title}：将 {selected.length} 人设为“
              {outcomeLabels[action]}”。
            </p>
            <div className="review-selection">
              {people
                .filter((p) => selected.includes(p.employee_id))
                .map((p) => (
                  <div key={p.employee_id}>
                    {p.name}（{p.employee_id}）：{outcomeLabels[p.outcome]} →{" "}
                    {outcomeLabels[action]}
                  </div>
                ))}
            </div>
            <label>
              核对人
              <input
                required
                maxLength={80}
                value={operator}
                disabled={busy || uncertain}
                onChange={(e) => setOperator(e.target.value)}
              />
            </label>
            <label>
              核对依据 / 更正原因
              <textarea
                required
                maxLength={1000}
                placeholder="例如：根据本场纸质签到表及现场同事确认"
                value={note}
                disabled={busy || uncertain}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                required
                checked={confirmed}
                disabled={busy || uncertain}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已核实所选人员；未在签到表出现并不直接等于未到场。
            </label>
            {error && <Message focusOnMount>{error}</Message>}
            {uncertain ? (
              <BusyButton
                type="button"
                className="button primary"
                busy={busy}
                pendingLabel="正在核实…"
                onClick={checkResult}
              >
                核实上次保存结果
              </BusyButton>
            ) : (
              <BusyButton busy={busy} pendingLabel="正在保存…">
                确认保存
              </BusyButton>
            )}
          </form>
        </Modal>
      )}
      {showTerm && (
        <Modal
          title="学期汇总导出"
          closeDisabled={busy}
          wide
          onClose={() => {
            if (!busy) setShowTerm(false);
          }}
        >
          <p>
            选择本学期需要统计的轮次或活动。导出含“人员汇总”和“逐场明细”；未来活动不计未到场，待核对不会当缺席。
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setScope(sessions.map((s) => s.id))}
            >
              全选场次
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setScope([])}
            >
              清空选择
            </button>
          </div>
          {rounds.map((r) => {
            const items = sessions.filter((s) => s.round_id === r.id);
            return (
              <fieldset key={r.id} className="review-scope">
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={
                        items.length > 0 &&
                        items.every((s) => scope.includes(s.id))
                      }
                      onChange={(e) =>
                        setScope((old) =>
                          e.target.checked
                            ? [...new Set([...old, ...items.map((s) => s.id)])]
                            : old.filter(
                                (id) => !items.some((s) => s.id === id),
                              ),
                        )
                      }
                    />
                    {r.title}
                  </label>
                </legend>
                {items.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={scope.includes(s.id)}
                      onChange={(e) =>
                        setScope((old) =>
                          e.target.checked
                            ? [...old, s.id]
                            : old.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {stamp(s.start_at)} · {s.title}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {error && <Message focusOnMount>{error}</Message>}
          <BusyButton
            className="button primary"
            busy={busy}
            pendingLabel="正在导出…"
            disabled={busy || !scope.length}
            onClick={exportTerm}
          >
            导出所选 {scope.length} 场汇总
          </BusyButton>
        </Modal>
      )}
      {history && (
        <Modal
          title="本场核对记录（最近操作）"
          wide
          onClose={() => setHistory(null)}
        >
          {!history.length ? (
            <p>本场尚无新版核对操作；原补记依据在原补记入口中保留。</p>
          ) : (
            history.map((h) => (
              <div className="review-history" key={h.id}>
                <strong>
                  {timeText(h.created_at)} · {h.after?.operator}
                </strong>
                <p>{h.after?.note}</p>
                {h.after?.entries?.map((p: any) => (
                  <div key={p.employee_id}>
                    {p.name}（{p.employee_id}）：
                    {outcomeLabels[p.outcome as Outcome]}
                  </div>
                ))}
              </div>
            ))
          )}
        </Modal>
      )}
    </section>
  );
}
