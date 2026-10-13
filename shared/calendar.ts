import type { Session } from "./model";
const text = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const date = (n: number) =>
  new Date(n * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
function fold(line: string): string {
  const parts: string[] = [];
  let part = "",
    bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75) {
      parts.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join("\r\n");
}
export function calendarFile(
  s: Session,
  now = Date.now() / 1000,
  language: "zh" | "en" = "zh",
): string {
  if (!["published", "paused"].includes(s.state))
    throw Error("本场当前不可添加到日历。");
  if (
    !Number.isFinite(s.start_at) ||
    !Number.isFinite(s.end_at) ||
    s.end_at <= s.start_at
  )
    throw Error("场次时间无效。");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Life Mentor Registration//Calendar//" + language.toUpperCase(),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + encodeURIComponent(s.id) + "@life-mentor-registration",
    "DTSTAMP:" + date(now),
    "SEQUENCE:" + s.content_version,
    "DTSTART:" + date(s.start_at),
    "DTEND:" + date(s.end_at),
    "SUMMARY:" + text(s.title),
    "LOCATION:" + text(s.venue),
    "DESCRIPTION:" +
      text(
        s.subjects.join(" / ") +
          (language === "en"
            ? "\nPlease refer to the registration page and staff notices. Changes and cancellations do not sync automatically. Update the imported calendar event yourself."
            : "\n请以报名页面和工作人员通知为准。导入后改期或取消不会自动同步，请自行调整旧日历事项。"),
      ),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    "DESCRIPTION:" +
      text(
        (language === "en" ? "Training reminder: " : "培训提醒：") + s.title,
      ),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
