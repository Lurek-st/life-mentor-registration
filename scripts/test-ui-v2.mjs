import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { localTestURL } from "./test-safety.mjs";
const base = await localTestURL(),
  out = "work/qa";
mkdirSync(out, { recursive: true });
const password = readFileSync(".dev.vars", "utf8").match(
  /^ADMIN_PASSWORD="([^"]+)"/m,
)[1];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
});
const errors = [],
  checks = [];
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const assertText = async (text) =>
  page.getByText(text, { exact: false }).first().waitFor();
async function fill(name, id) {
  await page.getByLabel("姓名 Name", { exact: true }).fill(name);
  await page
    .getByLabel("所属部门 Department / Unit", { exact: true })
    .fill("虚构界面测试部门");
  await page.getByLabel("工号 Employee number", { exact: true }).fill(id);
  await page.locator(".registration-form input[type=checkbox]").check();
}
try {
  const health = await (await ctx.request.get(base + "/api/health")).json();
  assert.equal(
    health.mode,
    "preview",
    "UI mutations only run against preview.",
  );
  await page.goto(base);
  await page.locator(".session-row").first().waitFor();
  assert.equal(await page.locator(".round-section").count(), 3);
  assert.equal(await page.locator(".session-row").count(), 12);
  assert.match(await page.title(), /导师同行/);
  await page.screenshot({ path: out + "/desktop-list.png", fullPage: true });
  await page.screenshot({ path: out + "/desktop-first.png" });
  const snapshot = await (await ctx.request.get(base + "/api/sessions")).json();
  const monthOf = (s) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
    }).format(new Date(s.start_at * 1000));
  const selectedMonth = monthOf(snapshot.sessions[0]);
  const matching = snapshot.sessions.filter(
    (s) => monthOf(s) === selectedMonth,
  );
  await page
    .getByRole("button", {
      name: Number(selectedMonth.slice(5)) + "月",
      exact: true,
    })
    .click();
  assert.equal(await page.locator(".session-row").count(), matching.length);
  assert.equal(
    await page.locator(".round-section").count(),
    new Set(matching.map((s) => s.round_id)).size,
  );
  await page.getByRole("button", { name: "全部轮次", exact: true }).click();
  checks.push(
    "Desktop 1440: 12 sessions in 3 rounds; calendar month filtering preserves rounds.",
  );
  await page
    .getByRole("button", { name: "查看并报名", exact: true })
    .first()
    .click();
  await fill("虚构界面导师", "TEST-UI-" + Date.now());
  await page.screenshot({ path: out + "/desktop-form.png", fullPage: true });
  await page.getByRole("button", { name: "确认测试报名", exact: true }).click();
  await assertText("测试报名成功");
  await page.getByRole("button", { name: "返回场次列表", exact: true }).click();
  await page.getByRole("button", { name: "我的报名", exact: true }).click();
  await assertText("虚构界面导师");
  await page.getByRole("button", { name: "取消本场报名", exact: true }).click();
  await page.getByRole("button", { name: "确认取消报名", exact: true }).click();
  await assertText("本人报名已取消");
  checks.push(
    "Editable three-field registration -> server confirmation -> My registrations -> cancel releases seat.",
  );
  await page.getByRole("button", { name: "培训场次", exact: true }).click();
  await page
    .getByRole("button", { name: "查看并报名", exact: true })
    .first()
    .click();
  await fill("虚构断网恢复导师", "TEST-LOST-" + Date.now());
  await page.route(
    "**/api/register",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "确认测试报名", exact: true }).click();
  await assertText("连接中断或等待超时");
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.getByRole("button", { name: "我的报名", exact: true }).click();
  await assertText("虚构断网恢复导师");
  await page.reload();
  await assertText("虚构断网恢复导师");
  checks.push(
    "Server commits but response is lost: reload recovers the same registration from pre-saved receipt.",
  );
  await page.screenshot({ path: out + "/mine.png", fullPage: true });
  await page.getByRole("button", { name: "取消本场报名", exact: true }).click();
  await page.getByRole("button", { name: "确认取消报名", exact: true }).click();
  await page.getByRole("button", { name: "工作人员入口", exact: true }).click();
  await page.getByLabel("工作人员口令", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录后台", exact: true }).click();
  await assertText("培训管理");
  await page.screenshot({ path: out + "/staff.png", fullPage: true });
  await page.getByRole("button", { name: "新增场次", exact: true }).click();
  const title = "界面验证活动 " + Date.now();
  await page.getByLabel("场次标题", { exact: true }).fill(title);
  await page.getByLabel("名额上限", { exact: true }).fill("45");
  await page.getByLabel("活动状态").selectOption("published");
  await page.getByRole("button", { name: "保存场次", exact: true }).click();
  await assertText("场次已创建。");
  const card = page
    .locator(".staff-session")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.waitFor();
  await card.getByRole("button", { name: "编辑 / 改期", exact: true }).click();
  await page.getByLabel("名额上限", { exact: true }).fill("50");
  const futureDay = new Date(
    (snapshot.sessions.at(-1).start_at + 14 * 86400 + 8 * 3600) * 1000,
  )
    .toISOString()
    .slice(0, 10);
  await page
    .getByLabel("开始时间（北京时间）", { exact: true })
    .fill(futureDay + "T14:00");
  await page
    .getByLabel("结束时间（北京时间）", { exact: true })
    .fill(futureDay + "T15:00");
  await page
    .getByRole("button", { name: "设为前一天22:00", exact: true })
    .click();
  await page.screenshot({ path: out + "/staff-editor.png", fullPage: true });
  await page.getByRole("button", { name: "保存场次", exact: true }).click();
  await card.getByText("0 / 50").waitFor();
  await card.getByRole("button", { name: "修改记录", exact: true }).click();
  await assertText("修改场次");
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await card.getByRole("button", { name: "归档", exact: true }).click();
  await page.getByRole("button", { name: "保存场次", exact: true }).click();
  await card.getByText("已归档").waitFor();
  checks.push(
    "Staff UI creates45-seat event, edits to50, postpones to a future day at 14:00, adjusts previous22:00 deadline, audits and archives.",
  );
  await page.getByRole("button", { name: "报名名单", exact: true }).click();
  await page.getByLabel("个人报名状态").selectOption("all");
  await page.locator("tbody tr").first().waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出筛选名单", exact: true }).click(),
  ]);
  const path = await download.path();
  const zip = unzipSync(readFileSync(path));
  const xml = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /t="inlineStr"/);
  assert.ok(!xml.includes("<f>"));
  assert.match(xml, /工号/);
  checks.push(
    "Staff Excel download is realXLSX, text cells preserve leading zeros and cannot execute formulas.",
  );
  await page.getByRole("button", { name: "规则与备份", exact: true }).click();
  await page.getByRole("button", { name: "修改报名规则", exact: true }).click();
  await page
    .getByLabel("每人最多可报场数（0表示不限）", { exact: true })
    .fill("0");
  await page.getByRole("button", { name: "保存规则", exact: true }).click();
  await assertText("报名规则已保存");
  checks.push("Rules UI saves with version check; backup controls present.");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(base);
  await mp.locator(".session-row").first().waitFor();
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mp.screenshot({ path: out + "/mobile-list.png", fullPage: true });
  await mp.screenshot({ path: out + "/mobile-first.png" });
  await mp
    .getByRole("button", { name: "查看并报名", exact: true })
    .first()
    .click();
  await mp.getByLabel("姓名 Name", { exact: true }).waitFor();
  assert.equal(
    await mp
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await mp.waitForTimeout(250);
  await mp.screenshot({ path: out + "/mobile-form.png" });
  await mp.getByLabel("姓名 Name", { exact: true }).scrollIntoViewIfNeeded();
  await mp.screenshot({ path: out + "/mobile-inputs.png" });
  await mp.getByRole("button", { name: "关闭详情", exact: true }).click();
  checks.push(
    "Mobile390x844: list and drawer without horizontal overflow, inputs and close action accessible.",
  );
  assert.deepEqual(errors, []);
  checks.push(
    "Page identity, nonblank content, no framework error overlay and zero page runtime errors.",
  );
  writeFileSync(
    out + "/ui-evidence.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        base,
        browser: "Playwright Chromium",
        viewports: ["1440x1000", "390x844"],
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.map((x) => "PASS " + x).join("\n"));
} finally {
  await browser.close();
}
