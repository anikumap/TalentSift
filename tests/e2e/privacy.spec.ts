import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("admin changes how long candidate data is kept, and it is audited", async ({ page }) => {
  await signUp(page, { org: "Privacy Care", name: "Priya Shah" });

  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByText("Candidate data is kept for 365 days")).toBeVisible();
  await expect(page.getByText("Nothing is old enough to erase yet.")).toBeVisible();

  await page.getByLabel("Keep candidate data for (days)").fill("180");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Data older than 180 days will be erased on the next run.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Candidate data is kept for 180 days")).toBeVisible();

  // Out-of-range values are stopped by the browser before submit (the server also rejects them: integration-tested).
  const field = page.getByLabel("Keep candidate data for (days)");
  await field.fill("10");
  expect(await field.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);

  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByText("Retention changed").filter({ visible: true }).first()).toBeVisible();
});
