import { useState } from "react";
import {
  type Session,
  type Round,
  type Template,
  type EventState,
  previousEvening,
  stateLabels,
} from "../shared/model";
import { localInput, stamp } from "../shared/programme";
import { api, ApiError } from "./api";
import { Modal, ModalCloseButton, Message } from "./components";
import { BusyButton } from "./motion";
export type EditSession = Session & { isNew?: boolean };
export default function SessionEditor({
  initial,
  rounds,
  templates,
  onClose,
  onSaved,
}: {
  initial: EditSession;
  rounds: Round[];
  templates: Template[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [s, set] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false);
  const patch = (v: Partial<Session>) => {
    set((old) => ({ ...old, ...v }));
    setAck(false);
  };
  const affected = initial.booked > 0 && !initial.isNew;
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    Number(e.target.value);
  const datetime = (value: string) =>
    Math.floor(new Date(value + ":00+08:00").getTime() / 1000);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ affected: number; needsNotice: boolean }>(
        "/admin/sessions" + (s.isNew ? "" : "/" + s.id),
        {
          ...s,
          subjects: s.subjects.map((x) => x.trim()).filter(Boolean),
          ackImpact: ack,
          expectedBooked: initial.booked,
        },
        s.isNew ? "POST" : "PATCH",
      );
      onSaved(
        s.isNew
          ? "场次已创建。"
          : r.needsNotice
            ? "已保存，原有 " +
              r.affected +
              " 条报名保留。请使用“通知文案”向已报名老师传达变更。"
            : "场次已保存。",
      );
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.message +
          (err.code === "EDIT_CONFLICT" || err.code === "IMPACT_STALE"
            ? " 请关闭本窗口，刷新后台后重新编辑。"
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      closeDisabled={busy}
      title={s.isNew ? "新增培训场次" : "编辑培训场次"}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="editor-form" onSubmit={save}>
        <div className="form-grid">
          <label>
            所属轮次
            <select
              disabled={busy}
              value={s.round_id}
              onChange={(e) => patch({ round_id: e.target.value })}
            >
              {rounds.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            活动状态
            <select
              disabled={busy}
              value={s.state}
              onChange={(e) => patch({ state: e.target.value as EventState })}
            >
              {["draft", "published", "paused", "cancelled", "archived"].map(
                (v) => (
                  <option key={v} value={v}>
                    {stateLabels[v]}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <label>
          内容模板
          <select
            disabled={busy}
            value={s.template_key}
            onChange={(e) => {
              const t = templates.find((t) => t.key === e.target.value);
              if (
                t &&
                confirm(
                  "使用模板将替换标题、主题和场内议程，其他设置保留。是否继续？",
                )
              )
                patch({
                  template_key: t.key,
                  title: t.title,
                  title_en: t.title_en,
                  subjects: [...t.subjects],
                  agenda: t.agenda.map((a) => ({ ...a })),
                });
            }}
          >
            <option value="custom">自定义</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          场次标题
          <input
            disabled={busy}
            required
            maxLength={160}
            value={s.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label>
          英文标题（可留空）
          <input
            disabled={busy}
            maxLength={200}
            value={s.title_en}
            onChange={(e) => patch({ title_en: e.target.value })}
          />
        </label>
        <label>
          主题摘要（每行一项）
          <textarea
            disabled={busy}
            value={s.subjects.join("\n")}
            onChange={(e) => patch({ subjects: e.target.value.split("\n") })}
          />
        </label>
        <div className="form-grid">
          <label>
            开始时间（北京时间）
            <input
              disabled={busy}
              type="datetime-local"
              required
              value={localInput(s.start_at)}
              onChange={(e) => {
                if (e.target.value)
                  patch({ start_at: datetime(e.target.value) });
              }}
            />
          </label>
          <label>
            结束时间（北京时间）
            <input
              disabled={busy}
              type="datetime-local"
              required
              value={localInput(s.end_at)}
              onChange={(e) => {
                if (e.target.value) patch({ end_at: datetime(e.target.value) });
              }}
            />
          </label>
          <label>
            报名截止时间
            <input
              disabled={busy}
              type="datetime-local"
              required
              value={localInput(s.deadline_at)}
              onChange={(e) => {
                if (e.target.value)
                  patch({ deadline_at: datetime(e.target.value) });
              }}
            />
          </label>
          <div className="field-action">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                patch({ deadline_at: previousEvening(s.start_at) })
              }
            >
              设为前一天22:00
            </button>
          </div>
          <label>
            名额上限
            <input
              disabled={busy}
              type="number"
              required
              min={1}
              max={100000}
              value={s.capacity}
              onChange={(e) => patch({ capacity: num(e) })}
            />
          </label>
          <label>
            同日排序
            <input
              disabled={busy}
              type="number"
              min={0}
              max={100000}
              value={s.sort_order}
              onChange={(e) => patch({ sort_order: num(e) })}
            />
          </label>
        </div>
        <label>
          培训地点
          <input
            disabled={busy}
            required
            maxLength={200}
            value={s.venue}
            onChange={(e) => patch({ venue: e.target.value })}
          />
        </label>
        <details className="agenda-editor">
          <summary>编辑场内议程（{s.agenda.length}项）</summary>
          <p className="muted">
            开始偏移为活动开始后多少分钟；改期后议程时间随之调整。
          </p>
          {s.agenda.map((a, i) => (
            <div className="agenda-edit-item" key={i}>
              <div className="form-grid">
                <label>
                  开始偏移（分钟）
                  <input
                    disabled={busy}
                    type="number"
                    min={0}
                    max={1440}
                    value={a.offset}
                    onChange={(e) =>
                      patch({
                        agenda: s.agenda.map((x, j) =>
                          i === j ? { ...x, offset: num(e) } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  时长（分钟）
                  <input
                    disabled={busy}
                    type="number"
                    min={1}
                    max={1440}
                    value={a.minutes}
                    onChange={(e) =>
                      patch({
                        agenda: s.agenda.map((x, j) =>
                          i === j ? { ...x, minutes: num(e) } : x,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                议程标题
                <input
                  disabled={busy}
                  required
                  maxLength={160}
                  value={a.title}
                  onChange={(e) =>
                    patch({
                      agenda: s.agenda.map((x, j) =>
                        i === j ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                内容说明
                <textarea
                  disabled={busy}
                  maxLength={3000}
                  value={a.description}
                  onChange={(e) =>
                    patch({
                      agenda: s.agenda.map((x, j) =>
                        i === j ? { ...x, description: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() =>
                  patch({ agenda: s.agenda.filter((_, j) => j !== i) })
                }
              >
                删除这一项议程
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              patch({
                agenda: [
                  ...s.agenda,
                  {
                    offset: 0,
                    minutes: 10,
                    title: "新增议程",
                    description: "",
                  },
                ],
              })
            }
          >
            增加议程
          </button>
        </details>
        <label>
          公开安排说明（改期、取消原因等）
          <textarea
            disabled={busy}
            maxLength={1000}
            value={s.change_note}
            onChange={(e) => patch({ change_note: e.target.value })}
          />
        </label>
        <div className="change-summary">
          <strong>保存后安排</strong>
          <p>
            {stamp(s.start_at)} — {stamp(s.end_at)} · {s.venue}
          </p>
          <p>
            {stateLabels[s.state]} · 容量 {s.capacity} 人 · 目前保留{" "}
            {initial.booked} 条未取消报名
          </p>
          {s.capacity < initial.booked && (
            <Message>
              容量低于已报名人数，将超额 {initial.booked - s.capacity}{" "}
              人。系统保留所有原报名，并停止新增；请由工作人员协调，不会自动删人。
            </Message>
          )}
          {["cancelled", "archived"].includes(s.state) && (
            <p>
              报名记录保留。取消会在公开页面提示，归档会从公开场次列表移除；恢复需改为“暂停报名”或“开放报名”。已由本人或工作人员取消的个人报名不会恢复。
            </p>
          )}
        </div>
        {affected && (
          <label className="check-label">
            <input
              disabled={busy}
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              已核对影响：本场有 {initial.booked}{" "}
              条未取消报名。我会协调受影响老师，并在需要时发出变更通知。
            </span>
          </label>
        )}
        {error && <Message focusOnMount>{error}</Message>}
        <div className="sticky-actions">
          <BusyButton
            className="button primary"
            busy={busy}
            pendingLabel="正在保存…"
            disabled={busy || (affected && !ack)}
          >
            保存场次
          </BusyButton>
          <ModalCloseButton className="button secondary" disabled={busy}>
            返回
          </ModalCloseButton>
        </div>
      </form>
    </Modal>
  );
}
