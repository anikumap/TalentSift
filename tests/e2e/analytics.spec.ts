import { test, expect } from "@playwright/test";
import { CAREGIVER, createAndPublish, signUp, uniqueEmail } from "./helpers";

test("candidate self-IDs optionally; admin sees analytics and the fairness monitor", async ({ page, browser }) => {
  await signUp(page, { org: "Fair Care", name: "Farah Khan" });
  const applyPath = await createAndPublish(page, CAREGIVER);

  // Candidate applies and answers one optional self-ID question
  const ctx = await browser.newContext();
  const cand = await ctx.newPage();
  await cand.goto(applyPath);
  await cand.getByRole("checkbox").check();
  await cand.getByRole("button", { name: "Continue" }).click();
  await cand.getByLabel("Full name").fill("Meena Iyer");
  await cand.getByLabel("Email").fill(uniqueEmail("meena"));
  await cand.getByLabel("Mobile number").fill("+91 98765 43210");
  await cand.getByLabel("City or area you live in").fill("Pune");
  await cand.getByRole("button", { name: "Continue" }).click();
  for (const group of await cand.locator("fieldset").all()) await group.getByText("Yes", { exact: true }).click();
  await cand.getByRole("button", { name: "Continue" }).click();
  const boxes = cand.locator("textarea");
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill("I stay calm, check the chart and tell the supervisor.");
  await cand.getByRole("button", { name: "Continue" }).click();
  await expect(cand.getByText("never shown to anyone reviewing your application")).toBeVisible();
  await cand.getByLabel("Gender").selectOption({ label: "Woman" });
  await cand.getByRole("button", { name: "Send application" }).click();
  await expect(cand.getByRole("heading", { name: "Application sent" })).toBeVisible();
  await ctx.close();

  // Reviewers never see it
  await page.getByRole("link", { name: /Shortlist/ }).click();
  await expect(page.getByText("Woman")).toHaveCount(0);

  // Analytics
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  const funnel = page.getByRole("table", { name: "Hiring funnel" });
  await expect(funnel.getByRole("row", { name: /Applied/ })).toContainText("1");

  // Fairness monitor
  await page.getByRole("link", { name: "Fairness monitor" }).click();
  await expect(page.getByRole("heading", { name: "Fairness monitor" })).toBeVisible();
  await expect(page.getByText("Not enough self-ID responses yet").first()).toBeVisible();
});
