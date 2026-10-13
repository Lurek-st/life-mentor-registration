import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { localTestURL } from "./test-safety.mjs";
const base = await localTestURL();
const out = "work/qa/v3";
mkdirSync(out, { recursive: true });
const password = readFileSync(".dev.vars", "utf8").match(
  /^ADMIN_PASSWORD="([^"]+)"/m,
)[1];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const api = async (path, data, method) => {
  const r = await context.request.fetch(base + "/api" + path, {
    method: method || (data ? "POST" : "GET"),
    data,
  });
  assert.ok(r.ok(), "Test fixture API failed: " + r.status() + " " + path);
  return r.json();
};
try {
  await page.goto(base + "/?lang=en");
  await expect(
    page.getByRole("heading", { name: "Choose your training sessions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View & register", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Contact email", { exact: true })).toBeVisible();
  // Empty drawer closes from the dimmed area and can be reopened normally.
  await page.mouse.click(30, 200);
  await expect(page.locator("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "View & register", exact: true })
    .first()
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Fictional participant");
  await page
    .getByLabel("Department / Unit", { exact: true })
    .fill("Example unit");
  await page
    .getByLabel("Employee number", { exact: true })
    .fill("TEST-EN-" + Date.now());
  await page
    .getByLabel("Contact email", { exact: true })
    .fill("english@example.invalid");
  await page.locator(".registration-form input[type=checkbox]").check();
  await page
    .getByRole("button", { name: "Confirm test registration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Test registration successful",
      exact: true,
    }),
  ).toBeVisible();
  const [calendar] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download calendar file/ }).click(),
  ]);
  assert.match(readFileSync(await calendar.path(), "utf8"), /BEGIN:VEVENT/);
  await page.screenshot({ path: out + "/english-success.png" });
  await page
    .getByRole("button", { name: "Back to sessions", exact: true })
    .click();
  console.log(
    "PASS English registration, outside click dismissal, confirmation and real calendar download",
  );

  await api("/admin/login", { password });
  const state = await api("/admin/state"),
    template = state.sessions.find(
      (s) => s.state === "published" && s.status === "open",
    );
  const created = (
    await api("/admin/sessions", {
      ...template,
      title: "参会核对虚构示例",
      title_en: "Community and Campus Resources",
      capacity: 36,
    })
  ).session;
  await page.reload();
  await expect(
    page.getByText("Community and Campus Resources", { exact: true }),
  ).toBeVisible();
  for (const [id, name] of [
    ["TEST-REVIEW-01", "虚构甲"],
    ["TEST-REVIEW-02", "虚构乙"],
  ]) {
    await api("/register", {
      sessionId: created.id,
      name,
      department: "示例部门",
      employeeId: id,
      email: id + "@example.invalid",
      contentRevision: created.content_version,
      requestId: randomUUID(),
      receipt: "mr_" + randomBytes(32).toString("hex"),
      consent: true,
    });
  }
  const fresh = (await api("/admin/state")).sessions.find(
      (s) => s.id === created.id,
    ),
    now = Math.floor(Date.now() / 1000);
  await api(
    "/admin/sessions/" + created.id,
    {
      ...fresh,
      start_at: now - 7200,
      end_at: now - 3600,
      deadline_at: now - 10800,
      ackImpact: true,
      expectedBooked: 2,
      change_note: "本机合成测试",
    },
    "PATCH",
  );
  await page.goto(base + "/?lang=zh#staff");
  await page.getByRole("button", { name: "参会核对", exact: true }).click();
  await page.getByLabel("培训场次", { exact: true }).selectOption(created.id);
  await expect(page.getByLabel("选择 虚构甲 TEST-REVIEW-01")).toBeVisible();
  await page.getByLabel("选择 虚构甲 TEST-REVIEW-01").check();
  await page.getByRole("button", { name: "标记已到场", exact: true }).click();
  await page.getByLabel("核对人", { exact: true }).fill("虚构核对人");
  await page
    .getByLabel("核对依据 / 更正原因", { exact: true })
    .fill("合成签到数据，仅本机测试");
  await page
    .getByLabel("我已核实所选人员；未在签到表出现并不直接等于未到场。")
    .check();
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "TEST-REVIEW-01" }),
  ).toContainText("已到场");
  await expect(
    page.locator("tbody tr").filter({ hasText: "TEST-REVIEW-02" }),
  ).toContainText("待核对");
  await page
    .getByRole("button", { name: "补录未报名到场人员", exact: true })
    .click();
  const dialog = page.locator("dialog");
  await dialog.getByLabel("姓名", { exact: true }).fill("虚构丙");
  await dialog.getByLabel("所属部门", { exact: true }).fill("示例部门");
  await dialog
    .getByLabel("工号 Employee number", { exact: true })
    .fill("TEST-REVIEW-03");
  await dialog
    .getByLabel("联系邮箱 Email", { exact: true })
    .fill("walkin@example.invalid");
  await dialog.getByLabel("到场确认人", { exact: true }).fill("虚构核对人");
  await dialog.getByLabel("到场确认依据", { exact: true }).fill("合成现场记录");
  await dialog.getByLabel("我已核对场次和人员，并确认其实际到场。").check();
  await dialog
    .getByRole("button", { name: "确认参会补记", exact: true })
    .click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "TEST-REVIEW-03" }),
  ).toContainText("已到场");
  await page.screenshot({ path: out + "/attendance.png", fullPage: true });
  const [sheet] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出本场总名单", exact: true }).click(),
  ]);
  const xml = strFromU8(
    unzipSync(readFileSync(await sheet.path()))["xl/worksheets/sheet1.xml"],
  );
  for (const id of ["TEST-REVIEW-01", "TEST-REVIEW-02", "TEST-REVIEW-03"])
    assert.ok(xml.includes(id));
  assert.ok(xml.includes("待核对"));
  assert.ok(!xml.includes("<f>"));
  const review = await api("/admin/attendance-review?session=" + created.id);
  assert.equal(review.people.filter((p) => p.registered).length, 2);
  assert.equal(review.people.filter((p) => p.outcome === "present").length, 2);
  console.log(
    "PASS actual staff UI review, unselected person stays pending, walk-in preserved separately, combined XLSX contains all three",
  );

  await page.getByRole("button", { name: "规则与备份", exact: true }).click();
  await page
    .getByRole("button", { name: "下载加密完整备份", exact: true })
    .click();
  await page.getByLabel("工作人员口令（再次核对身份）").fill(password);
  const phrase = "Synthetic backup password " + randomUUID();
  await page
    .getByLabel("备份密码（至少16个字符）", { exact: true })
    .fill(phrase);
  await page.getByLabel("再次填写备份密码", { exact: true }).fill(phrase);
  const [backup] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "加密并下载", exact: true }).click(),
  ]);
  const encrypted = JSON.parse(readFileSync(await backup.path(), "utf8"));
  assert.equal(encrypted.format, "mentor-encrypted-backup-v1");
  assert.ok(!JSON.stringify(encrypted).includes("虚构甲"));
  console.log(
    "PASS staff browser backup reauthentication, encryption and real file download",
  );

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(base + "/?lang=en");
  await expect(mp.locator(".session-row").first()).toBeVisible();
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mp
    .getByRole("button", { name: "View & register", exact: true })
    .first()
    .click();
  await expect(mp.getByLabel("Contact email", { exact: true })).toBeVisible();
  assert.equal(
    await mp.locator("dialog").evaluate((e) => e.scrollWidth <= e.clientWidth),
    true,
  );
  await mp.getByRole("button", { name: "Close details", exact: true }).click();
  await expect(mp.locator("dialog")).toHaveCount(0);
  await mp.screenshot({ path: out + "/mobile-english-reduced-motion.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS mobile English, reduced-motion readability, drawer close and no runtime errors",
  );
} finally {
  await browser.close();
}
