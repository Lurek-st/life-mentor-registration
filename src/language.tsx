import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "../shared/model";
import {
  programmeEnglish,
  interfaceEnglish,
  errorEnglish,
  programmeTitleEn,
} from "./english";

type Language = "zh" | "en";
const preferenceKey = "mentor-language-v1";
const Context = createContext({
  language: "zh" as Language,
  setLanguage: (_: Language) => {},
  fixed: false,
});
const key = (value: string) => value.replace(/\s+/g, " ").trim();
const dictionary = {
  ...programmeEnglish,
  ...interfaceEnglish,
  ...errorEnglish,
};
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
function initialLanguage(): Language {
  const query = new URLSearchParams(location.search).get("lang");
  if (query === "zh" || query === "en") return query;
  try {
    if (localStorage.getItem(preferenceKey) === "en") return "en";
  } catch {
    /* Optional preference. */
  }
  return "zh";
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title =
      language === "en" ? programmeTitleEn : "导师同行：培训报名与参会管理";
    try {
      localStorage.setItem(preferenceKey, language);
    } catch {
      /* Optional preference. */
    }
    const url = new URL(location.href);
    url.searchParams.set("lang", language);
    history.replaceState(history.state, "", url);
  }, [language]);
  const value = useMemo(
    () => ({ language, setLanguage, fixed: false }),
    [language],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// Staff tools retain their existing working language without changing the visitor's preference.
export function ChineseStaffScope({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      language: "zh" as Language,
      setLanguage: (_: Language) => {},
      fixed: true,
    }),
    [],
  );
  return (
    <Context.Provider value={value}>
      <div lang="zh-CN">{children}</div>
    </Context.Provider>
  );
}
export function useLanguage() {
  const context = useContext(Context);
  return useMemo(() => {
    const english = context.language === "en";
    const tr = (value: string) =>
      english ? (dictionary[key(value)] ?? value) : value;
    const content = (value: string) => {
      if (!english || !value) return value;
      if (dictionary[key(value)] !== undefined) return dictionary[key(value)];
      const round = /^第([0-9]+)轮$/.exec(value);
      if (round) return "Round " + round[1];
      const pieces = value.split(/[；;]/).map(key);
      if (
        pieces.length > 1 &&
        pieces.every((p) => !hasChinese(p) || dictionary[p] !== undefined)
      )
        return pieces.map((p) => dictionary[p] ?? p).join("; ");
      // Preserve new staff edits verbatim instead of showing an outdated template translation.
      return hasChinese(value)
        ? value + " [original text; English translation pending]"
        : value;
    };
    const sessionTitle = (s: Pick<Session, "title" | "title_en">) => {
      if (!english) return s.title;
      return s.title_en?.trim() || content(s.title);
    };
    const format = (n: number, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(english ? "en-GB" : "zh-CN", {
        timeZone: "Asia/Shanghai",
        ...options,
      })
        .format(new Date(n * 1000))
        .replaceAll("/", ".");
    const shortDate = (n: number) =>
      format(n, { month: english ? "short" : "2-digit", day: "2-digit" });
    const stamp = (n: number) =>
      format(n, {
        month: english ? "short" : "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    const weekday = (n: number) => format(n, { weekday: "short" });
    const states: Record<string, string> = english
      ? {
          draft: "Draft",
          published: "Open for registration",
          open: "Open",
          full: "Full",
          closed: "Closed",
          paused: "Registration paused",
          cancelled: "Session cancelled",
          archived: "Archived",
        }
      : {
          draft: "草稿",
          published: "开放报名",
          open: "报名中",
          full: "已报满",
          closed: "已截止",
          paused: "暂停报名",
          cancelled: "活动已取消",
          archived: "已归档",
        };
    const monthLabel = (value: string, sameYear: boolean) =>
      english
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Shanghai",
            month: "short",
            ...(sameYear ? {} : { year: "numeric" as const }),
          }).format(new Date(value + "-01T12:00:00+08:00"))
        : sameYear
          ? Number(value.slice(5)) + "月"
          : value.replace("-", "年") + "月";
    return {
      ...context,
      english,
      tr,
      content,
      sessionTitle,
      shortDate,
      stamp,
      weekday,
      stateLabels: states,
      monthLabel,
    };
  }, [context]);
}
export function LanguageSwitch() {
  const { language, setLanguage, fixed } = useLanguage();
  if (fixed) return null;
  return (
    <div className="language-switch" role="group" aria-label="Language / 语言">
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={language === "zh"}
        onClick={() => setLanguage("zh")}
      >
        中文
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        English
      </button>
    </div>
  );
}
