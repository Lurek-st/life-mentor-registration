type SummaryRecord = {
  name: string;
  department: string;
  employee_id: string;
  email: string;
  cancelled_at: number | null;
  event_state: string;
};
export function registrationSummary(records: SummaryRecord[]): string[][] {
  const people = new Map<
    string,
    {
      names: Set<string>;
      departments: Set<string>;
      emails: Set<string>;
      counts: number[];
    }
  >();
  for (const r of records) {
    let p = people.get(r.employee_id);
    if (!p) {
      p = {
        names: new Set(),
        departments: new Set(),
        emails: new Set(),
        counts: [0, 0, 0, 0, 0],
      };
      people.set(r.employee_id, p);
    }
    p.names.add(r.name);
    p.departments.add(r.department);
    if (r.email) p.emails.add(r.email.toLowerCase());
    // Categories are mutually exclusive; event state never implies attendance.
    const index = r.cancelled_at
      ? 4
      : r.event_state === "cancelled"
        ? 3
        : r.event_state === "draft"
          ? 2
          : r.event_state === "archived"
            ? 1
            : 0;
    p.counts[index]++;
  }
  return [
    [
      "工号",
      "姓名（不同记录并列）",
      "所属部门",
      "联系邮箱",
      "开放或暂停活动的未取消报名数",
      "归档活动的未取消报名数",
      "撤回草稿活动的未取消报名数",
      "取消活动的未取消报名数",
      "个人已取消报名数",
      "记录总数",
      "统计说明",
    ],
    ...[...people]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, p]) => [
        id,
        [...p.names].join(" / "),
        [...p.departments].join(" / "),
        [...p.emails].join("; "),
        ...p.counts.map(String),
        String(p.counts.reduce((a, b) => a + b, 0)),
        "仅统计当前筛选范围的报名记录，不等于实际出席或完成培训次数",
      ]),
  ];
}
