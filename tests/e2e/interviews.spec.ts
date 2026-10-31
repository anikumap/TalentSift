import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { CAREGIVER, applyInNewContext, createAndPublish, signUp, uniqueEmail } from "./helpers";

const GOOD = [
  "I'm Meena and I stay calm and gently explain why the medicine matters. I check the chart and the dose, then inform the family.",
  "I do not move him. I call 108 for an ambulance and keep him comfortable and safe.",
  "I stay until handover, write my notes and inform the supervisor.",
];

/** Opens the newest Outbox email whose subject matches and returns the first link to `path`. */
async function linkFromOutbox(page: Page, subject: RegExp, path: string): Promise<string> {
  await page.goto("/outbox");
  const item = page.locator("li").filter({ hasText: subject }).first();
  await item.locator("summary").click();
  const body = await item.locator("pre").innerText();
  const m = body.match(new RegExp(`https?://[^\\s]+${path}[A-Za-z0-9_-]+`));
  expect(m, `no ${path} link in: ${body}`).not.toBeNull();
  return new URL(m![0]).pathname;
}

/** Invites a teammate as Interviewer and accepts in a fresh context; returns their logged-in page. */
async function inviteInterviewer(page: Page, browser: Browser, name: string): Promise<Page> {
  await page.goto("/settings/team");
  await page.getByLabel("Email").fill(uniqueEmail("ravi"));
  await page.getByLabel("Role").selectOption({ label: "Interviewer" });
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(/sent|invited/i).first()).toBeVisible();
  const invitePath = await linkFromOutbox(page, /invited you to/, "/invite/");
  const ctx = await browser.newContext();
  const ip = await ctx.newPage();
  await ip.goto(invitePath);
  await ip.getByLabel("Your name").fill(name);
  await ip.getByLabel("Choose a password").fill("secret123");
  await ip.getByRole("button", { name: "Join team" }).click();
  await expect(ip.getByRole("heading", { name: `Hello, ${name.split(" ")[0]}` })).toBeVisible();
  return ip;
}

/** "YYYY-MM-DD" in India, `days` from now. */
const istDay = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);

test("full journey: slots, booking on a phone, feedback, offer, acceptance and hire", async ({ page, browser }) => {
  await signUp(page, { org: "Slot Care", name: "Asha Rao" });
  const applyPath = await createAndPublish(page, CAREGIVER);
  const jobUrl = page.url();
  await applyInNewContext(browser, applyPath, { name: "Meena Iyer", email: uniqueEmail("meena") }, (i) => GOOD[i]);
  const interviewer = await inviteInterviewer(page, browser, "Ravi Kumar");

  // Add interview times for tomorrow, 10:00–11:00 (two 30-minute slots)
  await page.goto(`${jobUrl.replace(/\/$/, "")}/interviews`);
  await page.getByLabel("From").fill("10:00");
  await page.getByLabel("Until").fill("11:00");
  await page.getByLabel("Interviewer").selectOption({ label: "Ravi Kumar (Interviewer)" });
  await page.getByLabel("Where").fill("Flat 2, Kothrud, Pune");
  await page.getByRole("button", { name: "Add times" }).click();
  await expect(page.getByText("Added 2 interview times.")).toBeVisible();
  await expect(page.getByText("· 2 open")).toBeVisible();

  // Move the candidate to Interview from the pipeline board
  await page.getByRole("link", { name: /Pipeline/ }).click();
  await page.getByLabel(/Move .* to/).first().selectOption("INTERVIEW");
  await expect(page.getByRole("region", { name: "Interview" })).toContainText("Meena Iyer");

  const bookPath = await linkFromOutbox(page, /Choose a time/, "/book/");

  // The candidate books on a phone
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cand = await phone.newPage();
  await cand.goto(bookPath);
  await expect(cand.getByRole("heading", { name: "Interview for Home Caregiver" })).toBeVisible();
  await cand.getByText("10:00 am").click();
  await cand.getByRole("button", { name: "Confirm this time" }).click();
  await expect(cand.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await expect(cand.getByText("Flat 2, Kothrud, Pune")).toBeVisible();
  await expect(cand.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("href", `${bookPath}/ics`);
  const ics = await cand.request.get(`${bookPath}/ics`);
  expect(ics.ok()).toBe(true);
  expect(await ics.text()).toContain("BEGIN:VEVENT");
  await phone.close();

  // The team sees it on /interviews
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Interviews" }).click();
  await expect(page.getByRole("link", { name: "Meena Iyer" })).toBeVisible(); // deciders see everyone's by default
  await page.getByRole("link", { name: "Mine only" }).click();
  await expect(page.getByRole("link", { name: "Meena Iyer" })).toHaveCount(0); // admin isn't the interviewer
  await page.getByRole("link", { name: "Everyone's" }).click();
  await expect(page.getByText(/10:00 am/)).toBeVisible();

  // The interview happens (move it one hour into the past), and the interviewer gives feedback
  const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
  try {
    const app = await prisma.application.findFirstOrThrow({ where: { job: { org: { name: "Slot Care" } } } });
    await prisma.interview.updateMany({ where: { applicationId: app.id }, data: { startsAt: new Date(Date.now() - 3_600_000) } });
  } finally {
    await prisma.$disconnect();
  }
  await interviewer.goto("/interviews");
  await expect(interviewer.getByRole("heading", { name: /Feedback due/ })).toBeVisible();
  await interviewer.getByRole("link", { name: "Give feedback" }).click();
  const form = interviewer.getByRole("form", { name: /Feedback for the interview/ });
  await form.waitFor(); // locator.all() doesn't wait: without this it can run on /interviews and click nothing
  for (const group of await form.locator("fieldset").all()) await group.getByText("Good", { exact: true }).click();
  await expect(form.getByRole("radio", { checked: true })).toHaveCount(await form.locator("fieldset").count());
  await form.getByLabel("Recommendation").selectOption({ label: "Yes" });
  await form.getByLabel(/Notes/).fill("Calm and clear about the medicine schedule.");
  await form.getByRole("button", { name: "Submit feedback" }).click();
  await expect(interviewer.getByText("Your feedback is in.")).toBeVisible();
  await expect(interviewer.getByRole("article", { name: "Feedback from Ravi Kumar" })).toContainText("Yes");
  const candidatePath = new URL(interviewer.url()).pathname;
  await interviewer.context().close();

  // The recruiter sends an offer
  await page.goto(candidatePath);
  await expect(page.getByRole("article", { name: "Feedback from Ravi Kumar" })).toBeVisible();
  const offer = page.getByRole("region", { name: "Offer" });
  await offer.getByLabel("Monthly pay (₹)").fill("20000");
  await offer.getByLabel("Start date").fill(istDay(7));
  await offer.getByLabel("Reply by").fill(istDay(3));
  await offer.getByRole("button", { name: "Send offer" }).click();
  await expect(offer.getByText("Sent", { exact: true })).toBeVisible();
  await expect(page.locator("h1 + p").getByText("Offer", { exact: true })).toBeVisible();

  // The candidate accepts on a phone
  const offerPath = await linkFromOutbox(page, /Your offer for/, "/offer/");
  const phone2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const c2 = await phone2.newPage();
  await c2.goto(offerPath);
  await expect(c2.getByRole("heading", { name: "Offer of employment" })).toBeVisible();
  await expect(c2.getByText("₹20,000 a month")).toBeVisible();
  await c2.getByLabel("Type your full name to sign").fill("Meena Iyer");
  await c2.getByLabel("I accept this offer on the terms above.").check();
  await c2.getByRole("button", { name: "Accept offer" }).click();
  await expect(c2.getByText("You've accepted this offer")).toBeVisible();
  await expect(c2.getByRole("button", { name: "Accept offer" })).toHaveCount(0);
  await c2.reload();
  await expect(c2.getByText("This offer has already been answered.")).toBeVisible();
  await phone2.close();

  // The recruiter sees the acceptance and marks the hire
  await page.goto(candidatePath);
  await expect(offer.getByText("Accepted", { exact: true })).toBeVisible();
  await offer.getByRole("button", { name: "Mark hired" }).click();
  await expect(page.locator("h1 + p").getByText("Hired", { exact: true })).toBeVisible();
  await expect(offer.getByRole("button", { name: "Mark hired" })).toHaveCount(0);
});

test("two candidates race for one time: the loser sees it's taken and the times still free", async ({ page, browser }) => {
  await signUp(page, { org: "Race Care", name: "Asha Rao" });
  const applyPath = await createAndPublish(page, CAREGIVER);
  const jobUrl = page.url().replace(/\/$/, "");
  await applyInNewContext(browser, applyPath, { name: "Meena Iyer", email: uniqueEmail("meena") }, (i) => GOOD[i]);
  await applyInNewContext(browser, applyPath, { name: "Lata Shah", email: uniqueEmail("lata") }, (i) => GOOD[i]);

  await page.goto(`${jobUrl}/interviews`);
  await page.getByLabel("From").fill("10:00");
  await page.getByLabel("Until").fill("11:00");
  await page.getByLabel("Interviewer").selectOption({ label: "Asha Rao (Admin)" });
  await page.getByLabel("Where").fill("Office");
  await page.getByRole("button", { name: "Add times" }).click();
  await expect(page.getByText("Added 2 interview times.")).toBeVisible();

  await page.goto(`${jobUrl}/board`);
  for (let i = 0; i < 2; i++) {
    await page.getByLabel(/Move Candidate #.* to/).first().selectOption("INTERVIEW");
    await expect(page.getByRole("region", { name: "Interview" }).locator("li")).toHaveCount(i + 1);
  }

  await page.goto("/outbox");
  const links: string[] = [];
  for (const item of await page.locator("li").filter({ hasText: /Choose a time/ }).all()) {
    await item.locator("summary").click();
    links.push(new URL((await item.locator("pre").innerText()).match(/https?:\/\/\S+\/book\/[\w-]+/)![0]).pathname);
  }
  expect(links).toHaveLength(2);

  const phones = await Promise.all(links.map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
  const [a, b] = await Promise.all(phones.map((c) => c.newPage()));
  await a.goto(links[0]);
  await b.goto(links[1]);
  await a.getByText("10:00 am").click();
  await b.getByText("10:00 am").click();
  await a.getByRole("button", { name: "Confirm this time" }).click();
  await expect(a.getByRole("heading", { name: "You're booked" })).toBeVisible();

  await b.getByRole("button", { name: "Confirm this time" }).click();
  await expect(b.getByText(/someone just took that time/)).toBeVisible();
  await expect(b.getByText("10:00 am")).toHaveCount(0);
  await expect(b.getByText("10:30 am")).toBeVisible();
  await b.getByText("10:30 am").click();
  await b.getByRole("button", { name: "Confirm this time" }).click();
  await expect(b.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await Promise.all(phones.map((c) => c.close()));
});
