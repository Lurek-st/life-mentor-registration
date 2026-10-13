import { useLanguage, LanguageSwitch } from "./language";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { X, Info, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { timeOnly } from "../shared/programme";
import { type Session } from "../shared/model";
import { programmeEnglish } from "./english";

// Multiple dialogs may be open (for example privacy over a registration form).
// Restore scrolling only after the last one leaves the native modal stack.
const openDialogs = new Set<HTMLDialogElement>();
let priorOverflow = "";
const DismissContext = createContext<(() => void) | null>(null);
export function ModalCloseButton({
  children,
  className,
  disabled = false,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
}) {
  const dismiss = useContext(DismissContext);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => dismiss?.()}
    >
      {children}
    </button>
  );
}
export function Notice() {
  const { tr, english } = useLanguage();
  return (
    <div className="notice">
      <AlertCircle size={19} />
      <div>
        <strong>
          {tr("测试环境 · 请使用虚构信息，正式报名请使用正式链接")}
        </strong>
        {!english && (
          <span lang="en">Test environment — fictional registrations only</span>
        )}
      </div>
    </div>
  );
}
export function Message({
  children,
  success = false,
  focusOnMount = false,
}: {
  children: ReactNode;
  success?: boolean;
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focusOnMount) {
      ref.current?.scrollIntoView({ block: "center", behavior: "instant" });
      ref.current?.focus({ preventScroll: true });
    }
  }, [focusOnMount]);
  return (
    <div
      ref={ref}
      tabIndex={focusOnMount ? -1 : undefined}
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
  closeDisabled = false,
  dismissOnBackdrop = false,
  focusKey,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeDisabled?: boolean;
  dismissOnBackdrop?: boolean;
  focusKey?: string | boolean;
}) {
  const { tr } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const backdropPress = useRef<{ x: number; y: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ onClose, closeDisabled });
  latest.current = { onClose, closeDisabled };
  function outsidePanel(x: number, y: number) {
    const bounds = ref.current?.getBoundingClientRect();
    return (
      !!bounds &&
      (x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > bounds.bottom)
    );
  }
  function finishClose() {
    if (!closingRef.current) return;
    clearTimeout(timer.current);
    closingRef.current = false;
    setClosing(false);
    if (!latest.current.closeDisabled) latest.current.onClose();
  }
  function dismiss() {
    if (latest.current.closeDisabled || closingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      latest.current.onClose();
      return;
    }
    // Reversing a drawer that is still entering must not jump to fully open.
    if (ref.current) {
      const style = getComputedStyle(ref.current);
      ref.current.style.setProperty("--drawer-close-from", style.transform);
      ref.current.style.setProperty("--drawer-close-opacity", style.opacity);
    }
    closingRef.current = true;
    setClosing(true);
    // A bounded fallback also closes if animations are disabled or interrupted.
    timer.current = setTimeout(finishClose, 240);
  }
  useLayoutEffect(() => {
    const d = ref.current!;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    d.showModal();
    if (!openDialogs.size) priorOverflow = document.body.style.overflow;
    openDialogs.add(d);
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(timer.current);
      d.close();
      openDialogs.delete(d);
      if (!openDialogs.size) document.body.style.overflow = priorOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  // A confirmed result replaces a long form. Start that new step at its title;
  // ordinary rerenders and language switches must preserve reading position.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [focusKey]);
  return (
    <dialog
      ref={ref}
      className={"drawer " + (wide ? "wide" : "")}
      data-closing={closing || undefined}
      aria-label={title}
      onPointerDown={(e) => {
        // A native dialog's backdrop targets the dialog itself, as can its
        // padding. Require the press to start outside the actual panel.
        backdropPress.current =
          dismissOnBackdrop &&
          e.target === e.currentTarget &&
          e.isPrimary &&
          e.button === 0 &&
          !latest.current.closeDisabled &&
          outsidePanel(e.clientX, e.clientY)
            ? { x: e.clientX, y: e.clientY }
            : null;
      }}
      onPointerCancel={() => {
        backdropPress.current = null;
      }}
      onClick={(e) => {
        const press = backdropPress.current;
        backdropPress.current = null;
        if (
          press &&
          e.target === e.currentTarget &&
          e.button === 0 &&
          e.detail > 0 &&
          outsidePanel(e.clientX, e.clientY) &&
          Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 10
        ) {
          // Close on click, not pointer-up, so reduced-motion dismissal cannot
          // let the same click activate a control underneath the panel.
          dismiss();
        }
      }}
      onAnimationEnd={(e) => {
        if (e.target === ref.current && e.animationName === "drawer-out")
          finishClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClose={() => {
        const d = ref.current;
        if (!d?.isConnected || d.open) return;
        // Some browsers force a native close after repeated Escape requests.
        // Keep pending saves visible, or settle React state immediately.
        if (latest.current.closeDisabled) {
          d.showModal();
          heading.current?.focus({ preventScroll: true });
        } else if (closingRef.current) {
          finishClose();
        } else {
          latest.current.onClose();
        }
      }}
    >
      <div className="drawer-head">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <LanguageSwitch />
        <button
          className="icon-button"
          type="button"
          disabled={closeDisabled || closing}
          onClick={dismiss}
          aria-label={tr("关闭详情")}
        >
          <X />
        </button>
      </div>
      <DismissContext.Provider value={dismiss}>
        <div className="drawer-body" inert={closing}>
          {children}
        </div>
      </DismissContext.Provider>
    </dialog>
  );
}
export function Occupancy({ session: s }: { session: Session }) {
  const { tr, stateLabels } = useLanguage();
  return (
    <div className={"occupancy " + s.status}>
      <div>
        {s.status === "open" ? (
          <>
            {tr("余")}
            <strong>{s.remaining}</strong>
            {tr("席")}
          </>
        ) : (
          <strong>{stateLabels[s.status]}</strong>
        )}
      </div>
      <small>
        {s.booked} / {s.capacity}
        {tr("人已报名")}
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
  const { tr, english, content, sessionTitle, shortDate, weekday, stamp } =
    useLanguage();
  return (
    <article className="session-row" data-reveal-key={`session:${s.id}`}>
      <div className="session-date">
        <strong>{shortDate(s.start_at)}</strong>
        <span>
          {weekday(s.start_at)} · {timeOnly(s.start_at)}
        </span>
      </div>
      <button className="topic-button" onClick={() => onOpen(s)}>
        <h3>{sessionTitle(s)}</h3>
        <span>{s.subjects.map(content).join(" / ")}</span>
        {!english && (
          <small lang="en">{programmeEnglish[s.title] || s.title_en}</small>
        )}
        <span className="detail-link">
          {tr("查看内容")}
          <ChevronRight size={14} />
        </span>
      </button>
      <div className="session-quota">
        <Occupancy session={s} />
        <span className="deadline">
          {tr("截止")}
          {stamp(s.deadline_at)}
        </span>
      </div>
      <button
        className={"button " + (s.status === "open" ? "primary" : "secondary")}
        onClick={() => onOpen(s)}
      >
        {s.status === "open" ? tr("查看并报名") : tr("查看详情")}
      </button>
    </article>
  );
}
export function Footnote() {
  const { tr } = useLanguage();
  return (
    <p className="footnote">
      <Info size={16} />
      <span>
        {tr(
          "各场独立报名，具体内容、地点和截止时间以场次详情为准。全部时间为北京时间。",
        )}
      </span>
    </p>
  );
}
