import { stamp } from "../shared/programme";
const labels: Record<string, string> = {
  title: "名称",
  title_en: "英文名称",
  round_id: "轮次",
  sort_order: "排序",
  subjects: "主题摘要",
  agenda: "场内议程",
  venue: "地点",
  start_at: "开始时间",
  end_at: "结束时间",
  deadline_at: "报名截止",
  capacity: "名额",
  state: "活动状态",
  change_note: "公开安排说明",
  name: "姓名",
  department: "部门",
  employee_id: "工号",
  employeeId: "工号",
  email: "联系邮箱",
  operator: "经办人 / 确认人（工作人员填写）",
  note: "补录原因 / 确认依据",
  recorded_by: "补录经办人",
  staff_note: "补录原因",
  confirmed_by: "到场确认人",
  confirmation_note: "确认依据",
  source: "记录来源",
  cancel_reason: "取消原因",
  reason: "取消原因",
  max_sessions: "每人最多场数",
  self_cancel: "允许自行取消",
  registration_open: "报名入口开放",
  contact: "事务联系方式",
  retention: "资料保存说明",
  allSessionsRevoked: "所有后台登录已退出",
};
const states: Record<string, string> = {
  draft: "草稿",
  published: "开放报名",
  paused: "暂停报名",
  cancelled: "活动已取消",
  archived: "已归档",
};
function display(
  k: string,
  v: any,
  rounds: { id: string; title: string }[],
): string {
  if (v === undefined || v === null) return "—";
  if (["start_at", "end_at", "deadline_at"].includes(k))
    return stamp(Number(v));
  if (k === "state") return states[v] || String(v);
  if (k === "round_id")
    return rounds.find((r) => r.id === v)?.title || "原轮次";
  if (k === "max_sessions" && Number(v) === 0) return "不限";
  if (["self_cancel", "registration_open", "allSessionsRevoked"].includes(k))
    return v === true || v === "true" ? "是" : "否";
  if (k === "subjects" || k === "agenda") {
    let a = v;
    try {
      if (typeof a === "string") a = JSON.parse(a);
    } catch {
      return String(v);
    }
    return Array.isArray(a)
      ? a
          .map((x) =>
            typeof x === "string"
              ? x
              : x.offset +
                "分钟起 · " +
                x.title +
                "（" +
                x.minutes +
                "分钟）" +
                (x.description ? "：" + x.description : ""),
          )
          .join("\n")
      : String(v);
  }
  return String(v);
}
export default function HistoryDiff({
  before,
  after,
  rounds,
}: {
  before: any;
  after: any;
  rounds: { id: string; title: string }[];
}) {
  const keys = Object.keys(after || before || {}).filter(
    (k) =>
      labels[k] &&
      JSON.stringify(before?.[k === "employeeId" ? "employee_id" : k]) !==
        JSON.stringify(after?.[k]),
  );
  return (
    <div className="history-diff">
      {keys.map((k) => (
        <div key={k}>
          <strong>{labels[k]}</strong>
          <p>
            <small>原：</small>
            {display(
              k,
              before?.[k === "employeeId" ? "employee_id" : k],
              rounds,
            )}
          </p>
          <p>
            <small>现：</small>
            {display(k, after?.[k], rounds)}
          </p>
        </div>
      ))}
    </div>
  );
}
