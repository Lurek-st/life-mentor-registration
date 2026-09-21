import { topics } from "./programme";
export type EventState =
  "draft" | "published" | "paused" | "cancelled" | "archived";
export type AgendaItem = {
  offset: number;
  minutes: number;
  title: string;
  description: string;
};
export type Round = {
  id: string;
  title: string;
  sort_order: number;
  version: number;
};
export type Session = {
  id: string;
  round_id: string;
  sort_order: number;
  template_key: string;
  title: string;
  title_en: string;
  subjects: string[];
  agenda: AgendaItem[];
  venue: string;
  start_at: number;
  end_at: number;
  deadline_at: number;
  capacity: number;
  state: EventState;
  version: number;
  content_version: number;
  booked: number;
  remaining: number;
  over_capacity: number;
  change_note: string;
  updated_at: number;
  status: EventState | "open" | "full" | "closed";
};
export type Settings = {
  max_sessions: string;
  self_cancel: string;
  registration_open: string;
  contact: string;
  retention: string;
  version: string;
};
export type Snapshot = {
  sessions: Session[];
  rounds: Round[];
  settings: Settings;
  serverNow: number;
  mode: "formal" | "preview";
  dataSpace: string;
};
export type Booking = {
  id: string;
  session_id: string;
  name: string;
  department: string;
  employee_id: string;
  created_at: number;
  cancelled_at: number | null;
  cancel_reason: string;
  version: number;
  confirmed_revision: number;
  snapshot: { title: string; venue: string; start_at: number; end_at: number };
  session: Session;
  content_changed: boolean;
  can_cancel: boolean;
  receiptIndex?: number;
};
export type Template = {
  key: string;
  title: string;
  title_en: string;
  subjects: string[];
  agenda: AgendaItem[];
};
export const templates: Template[] = Object.entries(topics).map(([key, t]) => ({
  key,
  title: t.title,
  title_en: t.en,
  subjects: t.subjects,
  agenda: [
    {
      offset: 0,
      minutes: 10,
      title: "欢迎与活动导览",
      description: "介绍本场目标、讨论安排和参与方式。",
    },
    ...t.subjects.map((subject, i) => ({
      offset: 10 + i * 10,
      minutes: 10,
      title: subject,
      description: t.items[i].join("；"),
    })),
    {
      offset: 30,
      minutes: 10,
      title: "实践经验分享",
      description: "参与者交流实践经验",
    },
    { offset: 40, minutes: 15, title: "自由交流与答疑", description: "" },
    { offset: 55, minutes: 5, title: "合影、离场", description: "" },
  ],
}));
export const stateLabels: Record<string, string> = {
  draft: "草稿",
  published: "开放报名",
  open: "报名中",
  full: "已报满",
  closed: "已截止",
  paused: "暂停报名",
  cancelled: "活动已取消",
  archived: "已归档",
};
export const dateText = (n: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(n * 1000));
export const shortDate = (n: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(n * 1000))
    .replaceAll("/", ".");
export const weekday = (n: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(n * 1000));
export const monthKey = (n: number) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(n * 1000));
export function previousEvening(start: number) {
  const d = new Date(start * 1000 + 8 * 3600000);
  return (
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 14) / 1000
  );
}
export function normalizeEmployee(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}
