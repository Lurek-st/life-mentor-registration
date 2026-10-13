import type { Session } from "../shared/model";
import { localInput } from "../shared/programme";

export type CombinedRecord = {
  id: string;
  session_id: string;
  name: string;
  department: string;
  employee_id: string;
  email: string;
  kind: "self" | "staff" | "attendance";
  created_at: number;
};
export type CombinedData = {
  session: Session;
  records: CombinedRecord[];
  generatedAt: number;
};
const time = (value: number) => localInput(value).replace("T", " ");
const eventStates = {
  published: "已发布",
  paused: "已暂停",
  cancelled: "已取消",
  archived: "已归档",
  draft: "草稿",
};

export function combinedRoster(data: CombinedData) {
  const people = new Map<string, CombinedRecord[]>();
  for (const record of data.records) {
    const id =
      typeof record.employee_id === "string"
        ? record.employee_id.normalize("NFKC").trim().toUpperCase()
        : "";
    if (
      !id ||
      record.session_id !== data.session.id ||
      !["self", "staff", "attendance"].includes(record.kind)
    )
      throw new Error("名单数据不完整或场次不符，未生成文件，请刷新后重试。");
    const group = people.get(id) || [];
    // Active database records should contain at most one of each kind of record per person.
    if (
      group.some(
        (x) => (x.kind === "attendance") === (record.kind === "attendance"),
      )
    )
      throw new Error("发现同工号的重复有效记录，请先在后台核对，未生成文件。");
    group.push(record);
    people.set(id, group);
  }
  let registered = 0,
    attended = 0,
    overlap = 0,
    conflicts = 0;
  const body = [...people.entries()].map(([id, group], index) => {
    const hasRegistration = group.some((x) => x.kind !== "attendance"),
      hasAttendance = group.some((x) => x.kind === "attendance");
    registered += Number(hasRegistration);
    attended += Number(hasAttendance);
    overlap += Number(hasRegistration && hasAttendance);
    const values = (key: "name" | "department" | "email") => [
      ...new Set(group.map((x) => x[key]?.trim() || "").filter(Boolean)),
    ];
    const different = (["name", "department", "email"] as const).filter(
      (key) => values(key).length > 1,
    );
    if (different.length) conflicts++;
    const labels = { name: "姓名", department: "部门", email: "邮箱" };
    return [
      String(index + 1),
      values("name").join(" / "),
      values("department").join(" / "),
      id,
      values("email").join("; "),
      group
        .map((x) =>
          x.kind === "attendance"
            ? "参会补记"
            : x.kind === "staff"
              ? "工作人员补报名"
              : "自主报名",
        )
        .join(" + "),
      hasRegistration ? "有效报名" : "未报名",
      hasAttendance ? "已确认到场" : "到场待核实",
      different.length
        ? different.map((x) => labels[x]).join("、") +
          "不一致，已保留两种填写，请核对"
        : "",
    ];
  });
  const counts = `合并人数：${people.size} 人　有效报名：${registered} 人　已确认参会：${attended} 人　两类重叠：${overlap} 人`;
  const date = time(data.session.start_at).slice(0, 10);
  const rows: string[][] = [
    [`${date} ${data.session.title}｜报名及参会补记总名单`],
    [
      `时间：${time(data.session.start_at)}—${time(data.session.end_at)}（北京时间）　地点：${data.session.venue}　活动状态：${eventStates[data.session.state]}`,
    ],
    [counts],
    [
      "口径：本场全部有效报名与未撤销参会补记，按工号合并；不受列表搜索、状态筛选和分页影响。合并人数不等于实际出席人数，到场待核实不代表缺席。",
    ],
    [
      `导出时间：${time(data.generatedAt)}（北京时间）　场次编号：${data.session.id}${conflicts ? `　${conflicts} 人资料待核对，详见最后一列。` : ""}`,
    ],
    [
      "序号",
      "姓名",
      "所属部门",
      "工号",
      "联系邮箱",
      "记录来源",
      "报名状态",
      "参会情况",
      "资料核对提示",
    ],
    ...body,
  ];
  const safeTitle =
    data.session.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").slice(0, 70) ||
    "活动";
  return {
    rows,
    total: people.size,
    registered,
    attended,
    overlap,
    conflicts,
    counts,
    filename: `${date}_${safeTitle}_报名及参会补记总名单_${localInput(data.generatedAt).replace(/[-:T]/g, "")}.xlsx`,
  };
}
