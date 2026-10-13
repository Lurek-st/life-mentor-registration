import { localInput } from "../shared/programme";
import {
  outcomeLabels,
  type ReviewData,
  type TermData,
} from "../shared/attendance";
export const timeText = (n: number) =>
  n ? localInput(n).replace("T", " ") : "";
export const safeFile = (s: string) =>
  s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").slice(0, 90);
export function attendanceRows(data: ReviewData) {
  const s = data.session;
  return [
    [
      "姓名",
      "所属部门",
      "工号",
      "联系邮箱",
      "报名状态",
      "参会情况",
      "需重新核实",
      "核对人",
      "核对依据",
      "核对时间（北京时间）",
      "活动日期",
      "活动主题",
      "场次编号",
      "活动状态",
      "导出时间（北京时间）",
    ],
    ...data.people.map((p) => [
      p.name,
      p.department,
      p.employee_id,
      p.email,
      p.registered
        ? "有效报名"
        : p.cancelledRegistration
          ? "已取消报名"
          : "未报名",
      outcomeLabels[p.outcome],
      p.conflict,
      p.operator,
      p.note,
      timeText(p.checked_at),
      timeText(s.start_at),
      s.title,
      s.id,
      s.state,
      timeText(data.generatedAt),
    ]),
  ];
}
export function termSheets(data: TermData) {
  const people = new Map<
    string,
    {
      names: Set<string>;
      departments: Set<string>;
      emails: Set<string>;
      registered: number;
      present: number;
      absent: number;
      pending: number;
      conflicts: number;
    }
  >();
  for (const event of data.events)
    for (const p of event.people) {
      const v = people.get(p.employee_id) || {
        names: new Set<string>(),
        departments: new Set<string>(),
        emails: new Set<string>(),
        registered: 0,
        present: 0,
        absent: 0,
        pending: 0,
        conflicts: 0,
      };
      v.names.add(p.name);
      v.departments.add(p.department);
      if (p.email) v.emails.add(p.email);
      const eligible = ["published", "paused", "archived"].includes(
        event.session.state,
      );
      v.registered += Number(p.registered && eligible);
      v.present += Number(p.outcome === "present");
      v.absent += Number(p.outcome === "absent");
      v.pending += Number(
        p.outcome === "unknown" &&
          event.session.end_at <= data.generatedAt &&
          (p.registered || p.legacyPresent || !!p.check) &&
          eligible,
      );
      v.conflicts += Number(p.needsReview);
      people.set(p.employee_id, v);
    }
  const detailHeader = attendanceRows({
    session: data.events[0]?.session,
    people: [],
    revision: 0,
    generatedAt: data.generatedAt,
  })[0];
  return [
    {
      name: "人员汇总",
      rows: [
        [
          "工号",
          "姓名",
          "所属部门",
          "联系邮箱",
          "有效报名次数",
          "已确认到场次数",
          "已确认未到场次数",
          "已结束场次待核对次数",
          "需重新核实场次数",
          "资料提示",
          "所选场次数",
          "导出时间（北京时间）",
        ],
        ...[...people]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, p]) => [
            id,
            [...p.names].join(" / "),
            [...p.departments].join(" / "),
            [...p.emails].join("; "),
            p.registered,
            p.present,
            p.absent,
            p.pending,
            p.conflicts,
            p.names.size > 1 || p.departments.size > 1 || p.emails.size > 1
              ? "跨场资料不一致，请核对"
              : "",
            data.events.length,
            timeText(data.generatedAt),
          ]),
      ],
    },
    {
      name: "逐场明细",
      rows: [
        detailHeader,
        ...data.events.flatMap((d) =>
          d.people.length
            ? attendanceRows(d).slice(1)
            : [
                [
                  "",
                  "",
                  "",
                  "",
                  "",
                  "无人员记录",
                  "",
                  "",
                  "",
                  "",
                  timeText(d.session.start_at),
                  d.session.title,
                  d.session.id,
                  d.session.state,
                  timeText(data.generatedAt),
                ],
              ],
        ),
      ],
    },
  ];
}
