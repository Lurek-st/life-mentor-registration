import { normalizeEmployee, type Session } from "./model";
export type Outcome = "present" | "absent" | "unknown";
export const outcomeLabels: Record<Outcome, string> = {
  present: "已到场",
  absent: "未到场",
  unknown: "待核对",
};
export type Evidence = {
  id: string;
  session_id: string;
  employee_id: string;
  name: string;
  department: string;
  email: string;
  version: number;
  cancelled_at: number | null;
  kind: "registration" | "attendance";
  operator?: string;
  note?: string;
  recorded_at?: number;
};
export type Check = {
  id: string;
  session_id: string;
  employee_id: string;
  name: string;
  department: string;
  email: string;
  outcome: Outcome;
  basis_json: string;
  session_start: number;
  session_end: number;
  operator: string;
  note: string;
  checked_at: number;
  version: number;
};
export type Person = {
  employee_id: string;
  name: string;
  department: string;
  email: string;
  registered: boolean;
  cancelledRegistration: boolean;
  legacyPresent: boolean;
  outcome: Outcome;
  storedOutcome?: Outcome;
  needsReview: boolean;
  conflict: string;
  operator: string;
  note: string;
  checked_at: number;
  check?: Check;
  evidence: Evidence[];
};
export type ReviewData = {
  session: Session;
  revision: number;
  people: Person[];
  generatedAt: number;
};
export type TermData = { events: ReviewData[]; generatedAt: number };
export function basis(records: Evidence[]) {
  return {
    identities: records
      .map((r) => [r.kind, r.id, normalizeEmployee(r.employee_id)])
      .sort(),
    attendance: records
      .filter((r) => r.kind === "attendance")
      .map((r) => [r.id, r.cancelled_at, r.operator || "", r.note || ""])
      .sort(),
  };
}
export function reviewPeople(
  s: Session,
  evidence: Evidence[],
  checks: Check[],
  now: number,
  timeChangedAt = 0,
): Person[] {
  const groups = new Map<string, Evidence[]>();
  for (const r of evidence) {
    const id = normalizeEmployee(r.employee_id);
    groups.set(id, [...(groups.get(id) || []), r]);
  }
  for (const c of checks)
    if (!groups.has(c.employee_id)) groups.set(c.employee_id, []);
  const recordsById = new Map(evidence.map((r) => [r.kind + ":" + r.id, r]));
  return [...groups]
    .filter(
      ([id, all]) =>
        all.length ||
        checks.find((c) => c.employee_id === id)?.outcome !== "unknown",
    )
    .map(([id, all]) => {
      const active = all.filter((r) => !r.cancelled_at),
        c = checks.find((x) => x.employee_id === id);
      const a = active.find((r) => r.kind === "attendance"),
        registered = active.some((r) => r.kind === "registration");
      let stale =
        !!a && timeChangedAt > 0 && (a.recorded_at || 0) <= timeChangedAt;
      if (c) {
        const old = JSON.parse(c.basis_json) as ReturnType<typeof basis>;
        stale =
          old.identities.some(
            ([kind, key, employee]) =>
              normalizeEmployee(
                recordsById.get(kind + ":" + key)?.employee_id || "",
              ) !== employee,
          ) ||
          JSON.stringify(old.attendance) !==
            JSON.stringify(basis(all).attendance) ||
          c.session_start !== s.start_at ||
          c.session_end !== s.end_at;
      }
      const relevant = active.length ? active : all;
      const vals = (k: "name" | "department" | "email") => [
        ...new Set(relevant.map((r) => r[k]?.trim()).filter(Boolean)),
      ];
      const conflict = (["name", "department", "email"] as const)
        .filter((k) => vals(k).length > 1)
        .map((k) => ({ name: "姓名", department: "部门", email: "邮箱" })[k])
        .join("、");
      const invalidEvent =
        ["draft", "cancelled"].includes(s.state) || s.start_at > now;
      const needsReview = stale || !!conflict || ((!!c || !!a) && invalidEvent);
      const outcome = needsReview
        ? "unknown"
        : c?.outcome || (a ? "present" : "unknown");
      return {
        employee_id: id,
        name: vals("name").join(" / ") || c?.name || "",
        department: vals("department").join(" / ") || c?.department || "",
        email: vals("email").join("; ") || c?.email || "",
        registered,
        cancelledRegistration: all.some(
          (r) => r.kind === "registration" && !!r.cancelled_at,
        ),
        legacyPresent: !!a,
        outcome,
        storedOutcome: c?.outcome,
        needsReview,
        conflict: conflict
          ? conflict + "不一致，请先更正原记录"
          : stale
            ? "身份、到场依据或活动时间已变化，请重新核对"
            : invalidEvent && (!!c || !!a)
              ? "活动取消、撤下或改期，请核实原参会记录"
              : "",
        operator: c?.operator || a?.operator || "",
        note: c?.note || a?.note || "",
        checked_at: c?.checked_at || a?.recorded_at || 0,
        check: c,
        evidence: all,
      };
    })
    .sort((a, b) => a.employee_id.localeCompare(b.employee_id));
}
