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
  const verb = method || (data === undefined ? "GET" : "POST");
  const readOnly = verb === "GET";
  const controller = new AbortController();
  // One total time budget, including response-body download and a bounded read retry.
  const timeout = setTimeout(() => controller.abort(), 20000);
  const networkError = () =>
    new ApiError(
      readOnly || path === "/mine"
        ? "连接中断或等待超时，请重新连接后再试。"
        : path === "/register"
          ? "连接中断或等待超时。请查看“我的报名”核对结果，再重试。"
          : "连接中断或等待超时，操作结果尚未确认。请刷新核对后再操作。",
      "NETWORK",
    );
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch("/api" + path, {
          method: verb,
          headers:
            data === undefined ? {} : { "Content-Type": "application/json" },
          body: data === undefined ? undefined : JSON.stringify(data),
          signal: controller.signal,
          cache: "no-store",
        });
        let value: any;
        try {
          value = await response.json();
        } catch {
          // HTML gateway errors must never be displayed as a successful API result.
          if (response.status === 429)
            throw new ApiError(
              "操作较频繁，请稍等一分钟后再试。",
              "RATE_LIMIT",
              429,
            );
          if (response.status >= 400 && response.status < 500)
            throw new ApiError("操作未完成。", "HTTP_ERROR", response.status);
          throw networkError();
        }
        if (!response.ok) {
          throw new ApiError(
            typeof value?.error === "string" ? value.error : "操作未完成。",
            typeof value?.code === "string" ? value.code : "",
            response.status,
            value && typeof value === "object" ? value : {},
          );
        }
        if (!value || typeof value !== "object") throw networkError();
        return value;
      } catch (error) {
        const e = error instanceof ApiError ? error : networkError();
        // Never replay a write, a login, a permission denial, or a rate-limited call.
        if (
          readOnly &&
          attempt === 0 &&
          !controller.signal.aborted &&
          (e.code === "NETWORK" || [502, 503, 504].includes(e.status))
        ) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (!controller.signal.aborted) continue;
        }
        throw e;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
export const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export type Profile = {
  name: string;
  department: string;
  employeeId: string;
  email: string;
};
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
    const list: Attempt[] = JSON.parse(
      localStorage.getItem(key(space)) || "[]",
    );
    if (!Array.isArray(list)) return [];
    const clean = list.map(minimalAttempt);
    if (list.some((a) => a.payload && (a.id || a.failed))) {
      try {
        localStorage.setItem(key(space), JSON.stringify(clean));
      } catch {
        /* Read remains available. */
      }
    }
    return clean;
  } catch {
    return [];
  }
}
function minimalAttempt(item: Attempt): Attempt {
  if (item.id || item.failed) {
    const { payload: _completedPayload, ...receipt } = item;
    return receipt;
  }
  return item; // Pending data is needed to safely recover an interrupted submission.
}
export function saveAttempt(space: string, item: Attempt) {
  const list = attempts(space).filter((x) => x.receipt !== item.receipt);
  list.push(minimalAttempt(item));
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
    return {
      name: "",
      department: "",
      employeeId: "",
      email: "",
      ...JSON.parse(
        sessionStorage.getItem("mentor-profile:" + space) || "null",
      ),
    };
  } catch {
    return { name: "", department: "", employeeId: "", email: "" };
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
