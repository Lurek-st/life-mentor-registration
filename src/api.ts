import type { Booking } from "../shared/model";
export class ApiError extends Error {
  constructor(
    message: string,
    public code = "",
    public status = 0,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    response = await fetch("/api" + path, {
      method: method || (data === undefined ? "GET" : "POST"),
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    clearTimeout(timeout);
    throw new ApiError(
      "连接中断或等待超时。请查看“我的报名”核对结果，再重试。",
      "NETWORK",
    );
  }
  let value: any;
  try {
    value = await response.json();
  } catch {
    throw new ApiError("服务暂时没有返回可识别的结果，请稍后重试。", "NETWORK");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw new ApiError(
      value.error || "操作未完成。",
      value.code,
      response.status,
      value,
    );
  return value;
}
export const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export type Profile = { name: string; department: string; employeeId: string };
export type Attempt = {
  receipt: string;
  requestId: string;
  sessionId: string;
  title: string;
  payload?: Record<string, unknown>;
  id?: string;
  failed?: string;
};
const key = (space: string) => "mentor-v2:" + space + ":receipts";
export function attempts(space: string): Attempt[] {
  try {
    return JSON.parse(localStorage.getItem(key(space)) || "[]");
  } catch {
    return [];
  }
}
export function saveAttempt(space: string, item: Attempt) {
  const list = attempts(space).filter((x) => x.receipt !== item.receipt);
  list.push(item);
  try {
    localStorage.setItem(key(space), JSON.stringify(list));
  } catch {
    throw Error(
      "本浏览器无法保存报名凭证。请使用允许保存网站数据的浏览器后重试。",
    );
  }
  if (!attempts(space).some((x) => x.receipt === item.receipt))
    throw Error("本浏览器无法保存报名凭证，请更换浏览器后报名。");
}
export function getProfile(space: string): Profile {
  try {
    return (
      JSON.parse(
        sessionStorage.getItem("mentor-profile:" + space) || "null",
      ) || { name: "", department: "", employeeId: "" }
    );
  } catch {
    return { name: "", department: "", employeeId: "" };
  }
}
export function rememberProfile(space: string, p: Profile) {
  try {
    sessionStorage.setItem("mentor-profile:" + space, JSON.stringify(p));
  } catch {
    /* optional convenience */
  }
}
export async function recover(
  space: string,
): Promise<(Booking & { receipt: string })[]> {
  const list = attempts(space),
    found: (Booking & { receipt: string })[] = [];
  for (let offset = 0; offset < list.length; offset += 90) {
    const group = list.slice(offset, offset + 90);
    const result = await api<{ registrations: Booking[] }>("/mine", {
      receipts: group.map((x) => x.receipt),
    });
    for (const r of result.registrations) {
      const a = group[r.receiptIndex!];
      found.push({ ...r, receipt: a.receipt });
      if (!a.id) {
        try {
          saveAttempt(space, { ...a, id: r.id, failed: undefined });
        } catch {
          /* Receipt already persisted before submission. */
        }
      }
    }
  }
  return found.sort((a, b) => a.session.start_at - b.session.start_at);
}
export function download(
  name: string,
  value: BlobPart,
  type = "text/plain;charset=utf-8",
) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([value], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
