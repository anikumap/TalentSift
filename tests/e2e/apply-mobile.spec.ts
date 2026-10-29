import { test, expect } from "@playwright/test";
import { createAndPublish, fillApplication, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const ANSWER = "I greet the customer with a smile, listen, apologise and check the bill and receipt with my manager.";

test("a candidate can apply on a phone-sized screen, and closed links say so", async ({ page, browser }) => {
  const admin = await browser.newContext();
  const recruiter = await admin.newPage();
  await signUp(recruiter, { org: "Quick Mart", name: "Kiran Shah" });
  const applyPath = await createAndPublish(recruiter, [
    "Store Cashier",
    "Andheri, Mumbai",
    "billing, help customers, restock shelves",
    "",
    ["14000", "17000"],
    "10 am to 7 pm",
  ]);

  // No horizontal scrolling on a phone
  await page.goto(applyPath);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Continuing without consent explains what's needed
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please agree so we can review your application.")).toBeVisible();

  await fillApplication(page, applyPath, { name: "Neha Joshi", email: "neha@example.in" }, () => ANSWER);
  await expect(page.getByRole("heading", { name: "Application sent" })).toBeVisible();

  // The same email can't apply twice
  await fillApplication(page, applyPath, { name: "Neha Joshi", email: "NEHA@example.in" }, () => ANSWER);
  await expect(page.getByRole("alert").filter({ hasText: "already applied" })).toBeVisible();

  // Closing the job closes the link
  await recruiter.getByRole("button", { name: "Close job" }).click();
  await expect(recruiter.getByText(/no longer accepts applications/).first()).toBeVisible();
  await page.goto(applyPath);
  await expect(page.getByRole("heading", { name: "This job is no longer accepting applications." })).toBeVisible();
  await admin.close();
});
