import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { localTestURL } from "./test-safety.mjs";
const base = await localTestURL("formal");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base);
  await page.locator(".session-row").first().waitFor();
  assert.equal(await page.locator(".notice").count(), 0);
  await page
    .getByRole("button", { name: "查看并报名", exact: true })
    .first()
    .click();
  const employee = "0000" + String(Date.now()).slice(-7);
  await page.getByLabel("姓名 Name", { exact: true }).fill("正式流程虚构测试");
  await page
    .getByLabel("所属部门 Department / Unit", { exact: true })
    .fill("仅本机验证");
  await page.getByLabel("工号 Employee number", { exact: true }).fill(employee);
  await page
    .getByLabel("联系邮箱 Email", { exact: true })
    .fill("formal-test@example.invalid");
  await page.locator(".registration-form input[type=checkbox]").check();
  await page.getByRole("button", { name: "确认报名", exact: true }).click();
  await page.getByRole("heading", { name: "报名成功", exact: true }).waitFor();
  await page.getByRole("button", { name: "返回场次列表", exact: true }).click();
  await page.getByRole("button", { name: "我的报名", exact: true }).click();
  await page.getByText(employee, { exact: false }).waitFor();
  await page.getByRole("button", { name: "取消本场报名", exact: true }).click();
  await page.getByRole("button", { name: "确认取消报名", exact: true }).click();
  await page.getByText("本人报名已取消", { exact: true }).waitFor();
  console.log(
    "PASS formal-mode local UI: ordinary employee number with leading zeros, no account, private receipt recovery and self cancellation.",
  );
} finally {
  await browser.close();
}
