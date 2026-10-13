import { useEffect, useLayoutEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode, RefObject } from "react";

// Content is always visible. The observer only enhances its first entrance;
// a missing observer, interrupted script or reduced-motion preference cannot hide it.
export function useSessionReveal(
  root: RefObject<HTMLElement | null>,
  page: string,
  listKey: string,
  filtered: boolean,
) {
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    if (page !== "sessions" || !root.current) return;
    const elements = Array.from(
      root.current.querySelectorAll<HTMLElement>("[data-reveal-key]"),
    );
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (
      filtered ||
      preference.matches ||
      !window.IntersectionObserver ||
      !Element.prototype.animate
    ) {
      elements.forEach((element) =>
        seen.current.add(element.dataset.revealKey!),
      );
      return;
    }
    const animations = new Map<HTMLElement, Animation>();
    const finish = (element: HTMLElement) => {
      seen.current.add(element.dataset.revealKey!);
      animations.get(element)?.cancel();
      animations.delete(element);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Wait until the heading and some of the row are inside the viewport.
          // isIntersecting alone can fire before the configured ratio is reached.
          if (!entry.isIntersecting || entry.intersectionRatio < 0.12) continue;
          const element = entry.target as HTMLElement;
          observer.unobserve(element);
          if (seen.current.has(element.dataset.revealKey!)) continue;
          finish(element);
          // Fast scrolling and keyboard navigation should expose content immediately.
          if (
            preference.matches ||
            entry.boundingClientRect.top < 0 ||
            element.contains(document.activeElement)
          )
            continue;
          const animation = element.animate(
            [
              { opacity: 0.18, transform: "translateY(20px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 560, easing: "cubic-bezier(.2,.65,.25,1)" },
          );
          animations.set(element, animation);
          animation.onfinish = () => animations.delete(element);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    for (const element of elements) {
      const bounds = element.getBoundingClientRect();
      if (
        bounds.top < innerHeight ||
        seen.current.has(element.dataset.revealKey!)
      )
        finish(element);
      else observer.observe(element);
    }
    const focus = (event: FocusEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-reveal-key]")
          : null;
      if (element) {
        finish(element);
        observer.unobserve(element);
      }
    };
    const reduce = () => {
      if (!preference.matches) return;
      observer.disconnect();
      elements.forEach(finish);
    };
    const container = root.current;
    container.addEventListener("focusin", focus);
    preference.addEventListener("change", reduce);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      container.removeEventListener("focusin", focus);
      preference.removeEventListener("change", reduce);
    };
  }, [root, page, listKey, filtered]);
}

// Animate a filter change in either direction, but do not double-animate a page
// entrance or replay when only the language or available places change.
export function useFilterTransition(
  root: RefObject<HTMLElement | null>,
  page: string,
  month: string,
) {
  const previous = useRef(month);
  useLayoutEffect(() => {
    if (previous.current === month) return;
    previous.current = month;
    const element =
      root.current?.querySelector<HTMLElement>(".session-results");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (
      page !== "sessions" ||
      !element ||
      preference.matches ||
      !element.animate
    )
      return;
    const animation = element.animate(
      [
        { opacity: 0.2, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.65,.25,1)" },
    );
    const reduce = () => {
      if (preference.matches) animation.cancel();
    };
    preference.addEventListener("change", reduce);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", reduce);
    };
  }, [root, page, month]);
}

export function usePagePosition(
  root: RefObject<HTMLElement | null>,
  page: string,
) {
  const active = useRef(page);
  const lastY = useRef(window.scrollY);
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    const remember = () => {
      lastY.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);
  useLayoutEffect(() => {
    if (active.current === page) return;
    positions.current.set(active.current, lastY.current);
    active.current = page;
    // Return to the list at the reader's position; action pages start at the top.
    const top = page === "sessions" ? positions.current.get(page) || 0 : 0;
    const heading =
      root.current?.querySelector<HTMLElement>("h1") || root.current;
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top, behavior: "instant" });
    lastY.current = window.scrollY;
  }, [root, page]);
}

export function BusyButton({
  busy,
  pendingLabel,
  children,
  className = "button primary",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={className + " busy-button"}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className="busy-label" aria-hidden={busy} data-visible={!busy}>
        {children}
      </span>
      <span className="busy-label" aria-hidden={!busy} data-visible={busy}>
        <span className="busy-indicator" aria-hidden="true" />
        {pendingLabel}
      </span>
    </button>
  );
}
