export type Topic = {
  title: string;
  en: string;
  subjects: [string, string];
  subjectsEn: [string, string];
  items: [string[], string[]];
};
export const topics: Record<string, Topic> = {
  connection: {
    title: "沟通与协作",
    en: "Communication and Collaboration",
    subjects: ["倾听与表达", "协作实践"],
    subjectsEn: ["Listening and Expression", "Working Together"],
    items: [
      ["交流相关经验", "讨论示例情境"],
      ["分享实践方法", "制定后续行动"],
    ],
  },
  community: {
    title: "资源与转介",
    en: "Resources and Referrals",
    subjects: ["资源梳理", "转介协作"],
    subjectsEn: ["Mapping Resources", "Referral Collaboration"],
    items: [
      ["交流相关经验", "讨论示例情境"],
      ["分享实践方法", "制定后续行动"],
    ],
  },
  support: {
    title: "支持与陪伴",
    en: "Support and Connection",
    subjects: ["建立联系", "支持边界"],
    subjectsEn: ["Building Connections", "Boundaries of Support"],
    items: [
      ["交流相关经验", "讨论示例情境"],
      ["分享实践方法", "制定后续行动"],
    ],
  },
  learning: {
    title: "学习与成长",
    en: "Learning and Growth",
    subjects: ["学习方法", "成长计划"],
    subjectsEn: ["Learning Methods", "Growth Plans"],
    items: [
      ["交流相关经验", "讨论示例情境"],
      ["分享实践方法", "制定后续行动"],
    ],
  },
};
export const venue = "示例活动室";
export const overview =
  "这是一个可自行部署的培训报名系统。示例活动围绕沟通、资源、支持与成长展开，供组织方体验场次报名和日常管理；所有初始内容均为演示素材，请在正式使用前替换。";
export const overviewEn =
  "A self-hostable registration system for training sessions. The sample programme covers communication, resources, support and learning. All initial sessions are fictional examples for exploring registration and event management.";
export function stamp(n: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(n * 1000))
    .replaceAll("/", ".");
}
export function timeOnly(n: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(n * 1000));
}
export function localInput(n: number) {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(n * 1000));
  return p.replace(" ", "T");
}
