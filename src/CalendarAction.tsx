import { useLanguage } from "./language";
import type { Session } from "../shared/model";
import { calendarFile } from "../shared/calendar";
import { download } from "./api";
export default function CalendarAction({ session }: { session: Session }) {
  const { tr, english, content, sessionTitle } = useLanguage();
  if (!["published", "paused"].includes(session.state)) return null;
  return (
    <div className="calendar-action">
      <button
        className="button secondary"
        type="button"
        onClick={() =>
          download(
            tr("培训日历.ics"),
            calendarFile(
              english
                ? {
                    ...session,
                    title: sessionTitle(session),
                    venue: content(session.venue),
                    subjects: session.subjects.map(content),
                  }
                : session,
              undefined,
              english ? "en" : "zh",
            ),
            "text/calendar;charset=utf-8",
          )
        }
      >
        {tr("下载日历文件（Outlook 等）")}
      </button>
      <p className="muted">
        {tr(
          "下载后打开文件，或在 Outlook 日历中选择“添加日历 → 从文件上传”。导入后，改期和取消不会自动同步，请自行调整原事项；提醒是否弹出取决于日历设置。微信内无法下载时，请用电脑或系统浏览器打开。",
        )}
      </p>
    </div>
  );
}
