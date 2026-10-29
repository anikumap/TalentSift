import { test, expect } from "@playwright/test";
import { CAREGIVER, applyInNewContext, createAndPublish, runIntake, signUp, uniqueEmail } from "./helpers";

const GOOD = [
  "I'm Meena and I stay calm and gently explain why the medicine matters. I check the chart and the dose, then inform the family.",
  "I do not move him. I call 108 for an ambulance and keep him comfortable and safe.",
  "I stay until handover, write my notes and inform the supervisor.",
];

test("recruiter posts a job, candidate applies, recruiter decides on evidence", async ({ page, browser }) => {
  await signUp(page, { org: "Asha Home Care", name: "Asha Rao" });

  // Intake → draft job, with the scorecard previewed live
  await runIntake(page, CAREGIVER);
  await expect(page.getByLabel("Scorecard preview")).toContainText("Patient care & dignity");
  await page.getByRole("button", { name: "Create draft job" }).click();
  await expect(page.getByRole("heading", { name: "Home Caregiver" })).toBeVisible();

  // Publish
  await page.getByRole("button", { name: "Publish job" }).click();
  await expect(page.getByText("Published. The apply link is live.")).toBeVisible();
  const applyPath = (await page.getByRole("link", { name: /\/apply\// }).getAttribute("href"))!;

  // Candidate applies from a separate, logged-out browser
  await applyInNewContext(browser, applyPath, { name: "Meena Iyer", email: uniqueEmail("meena") }, (i) => GOOD[i]);

  // Shortlist: identity hidden, evidence quoted with the name redacted
  await page.getByRole("link", { name: /Shortlist/ }).click();
  const row = page.getByRole("list", { name: "Ranked candidates" }).locator("li").first();
  await expect(row).toContainText("Candidate #");
  await expect(row).not.toContainText("Meena");
  await row.locator("summary").click();
  await expect(row.locator(".evidence").first()).toBeVisible();
  await expect(row).toContainText("[name]");

  // Shortlisting reveals the person
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByRole("list", { name: "Ranked candidates" })).toContainText("Meena Iyer");

  // The audit log records the decision and the reveal
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("cell", { name: "Stage changed" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Identity revealed" })).toBeVisible();

  // The candidate invite is in the outbox
  await page.getByRole("link", { name: "Outbox" }).click();
  await expect(page.getByText(/Next step for your Home Caregiver application/)).toBeVisible();
});

test("reject needs a reason and sends a respectful email", async ({ page, browser }) => {
  await signUp(page, { org: "Ravi Care", name: "Ravi Menon" });
  const applyPath = await createAndPublish(page, CAREGIVER);
  await applyInNewContext(browser, applyPath, { name: "Kavya Rao", email: uniqueEmail("kavya") }, (i) => GOOD[i]);

  await page.getByRole("link", { name: /Shortlist/ }).click();
  const row = page.getByRole("list", { name: "Ranked candidates" }).locator("li").first();
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Reject" }).click();

  const dialog = page.getByRole("dialog", { name: "Reject this candidate?" });
  await expect(dialog.getByRole("button", { name: "Reject candidate" })).toBeDisabled();
  await dialog.getByLabel("Position filled").check();
  await dialog.getByRole("button", { name: "Reject candidate" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Rejected");

  await page.getByRole("link", { name: "Outbox" }).click();
  await page.getByText(/Your application for Home Caregiver/).click();
  await expect(page.getByText(/Thank you for taking the time to apply/)).toBeVisible();
});

test("pipeline board moves a candidate with the keyboard-friendly menu", async ({ page, browser }) => {
  await signUp(page, { org: "Board Co", name: "Sam Board" });
  const applyPath = await createAndPublish(page, CAREGIVER);
  await applyInNewContext(browser, applyPath, { name: "Lata Shah", email: uniqueEmail("lata") }, (i) => GOOD[i]);

  await page.getByRole("link", { name: /Pipeline/ }).click();
  await page.getByLabel(/Move Candidate #.* to/).selectOption("INTERVIEW");
  await expect(page.getByRole("region", { name: "Interview" })).toContainText("Lata Shah");
});
