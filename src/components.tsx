import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X, Info, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { stamp, timeOnly } from "../shared/programme";
import { type Session, shortDate, weekday, stateLabels } from "../shared/model";
export function Notice() {
  return (
    <div className="notice">
      <AlertCircle size={19} />
      <div>
        <strong>测试环境 · 请使用虚构信息，正式报名请使用正式链接</strong>
        <span>Test environment — fictional registrations only</span>
      </div>
    </div>
  );
}
export function Message({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={"message " + (success ? "success" : "")}
      role={success ? "status" : "alert"}
    >
      {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = prior;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"drawer " + (wide ? "wide" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="drawer-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭详情">
          <X />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
export function Occupancy({ session: s }: { session: Session }) {
  return (
    <div className={"occupancy " + s.status}>
      <div>
        {s.status === "open" ? (
          <>
            余 <strong>{s.remaining}</strong> 席
          </>
        ) : (
          <strong>{stateLabels[s.status]}</strong>
        )}
      </div>
      <small>
        {s.booked} / {s.capacity} 人已报名
      </small>
    </div>
  );
}
export function SessionRow({
  session: s,
  onOpen,
}: {
  session: Session;
  onOpen: (s: Session) => void;
}) {
  return (
    <article className="session-row">
      <div className="session-date">
        <strong>{shortDate(s.start_at)}</strong>
        <span>
          {weekday(s.start_at)} · {timeOnly(s.start_at)}
        </span>
      </div>
      <button className="topic-button" onClick={() => onOpen(s)}>
        <h3>{s.title}</h3>
        <span>{s.subjects.join(" / ")}</span>
        <small>{s.title_en}</small>
        <span className="detail-link">
          查看内容 <ChevronRight size={14} />
        </span>
      </button>
      <div className="session-quota">
        <Occupancy session={s} />
        <span className="deadline">截止 {stamp(s.deadline_at)}</span>
      </div>
      <button
        className={"button " + (s.status === "open" ? "primary" : "secondary")}
        onClick={() => onOpen(s)}
      >
        {s.status === "open" ? "查看并报名" : "查看详情"}
      </button>
    </article>
  );
}
export function Footnote() {
  return (
    <p className="footnote">
      <Info size={16} />
      <span>
        各场独立报名，具体内容、地点和截止时间以场次详情为准。全部时间为北京时间。
      </span>
    </p>
  );
}
