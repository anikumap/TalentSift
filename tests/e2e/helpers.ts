import { expect, type Browser, type Page } from "@playwright/test";

let n = 0;
export const uniqueEmail = (prefix: string) => `${prefix}${Date.now()}${n++}@e2e.test`;

export async function signUp(page: Page, opts: { org: string; name: string; email?: string }) {
  const email = opts.email ?? uniqueEmail("rec");
  await page.goto("/signup");
  await page.getByLabel("Organisation name").fill(opts.org);
  await page.getByLabel("Your name").fill(opts.name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${opts.name.split(" ")[0]}` })).toBeVisible();
  return email;
}

/** Walks the intake chat. `answers` are the six steps; index 4 is [min, max] pay. */
export async function runIntake(page: Page, answers: [string, string, string, string, [string, string], string]) {
  await page.goto("/jobs/new");
  for (const [i, value] of answers.entries()) {
    if (i === 4) {
      const [min, max] = value as [string, string];
      await page.getByLabel("Minimum (₹/month)").fill(min);
      await page.getByLabel("Maximum (₹/month)").fill(max);
    } else if (value) {
      await page.locator("#answer").fill(value as string);
    }
    await page.getByRole("button", { name: /^(Next|Skip)$/ }).click();
  }
}

export async function createAndPublish(page: Page, answers: Parameters<typeof runIntake>[1]): Promise<string> {
  await runIntake(page, answers);
  await page.getByRole("button", { name: "Create draft job" }).click();
  await page.getByRole("button", { name: "Publish job" }).click();
  await expect(page.getByText("Published. The apply link is live.")).toBeVisible();
  return (await page.getByRole("link", { name: /\/apply\// }).getAttribute("href"))!;
}

export const CAREGIVER: Parameters<typeof runIntake>[1] = [
  "Home Caregiver",
  "Kothrud, Pune",
  "help with bathing, give medicines on time, keep notes",
  "Weekend availability",
  ["18000", "24000"],
  "12-hour day shifts",
];

export async function fillApplication(page: Page, path: string, who: { name: string; email: string }, answerText: (i: number) => string) {
  await page.goto(path);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Full name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Mobile number").fill("+91 98765 43210");
  await page.getByLabel("City or area you live in").fill("Pune");
  await page.getByRole("button", { name: "Continue" }).click();

  for (const group of await page.locator("fieldset").all()) await group.getByText("Yes", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const boxes = page.locator("textarea");
  const count = await boxes.count();
  for (let i = 0; i < count; i++) await boxes.nth(i).fill(answerText(i));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Send application" }).click();
}

export async function applyInNewContext(browser: Browser, path: string, who: { name: string; email: string }, answerText: (i: number) => string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await fillApplication(page, path, who, answerText);
  await expect(page.getByRole("heading", { name: "Application sent" })).toBeVisible();
  await ctx.close();
}
