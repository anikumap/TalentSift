import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, publishJob, getJob } from "@/services/jobs";
import { submitApplication } from "@/services/applications";
import { getBilling, startCheckout, confirmCheckout } from "@/services/billing";
import { getDashboard, listAudit, listOutbox } from "@/services/dashboard";
import { inviteMember } from "@/services/auth";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

const newJob = (admin: Parameters<typeof createJobFromIntake>[0], n: number) =>
  createJobFromIntake(admin, { ...caregiverIntake, title: `Caregiver ${n}` });

describe("billing service", () => {
  beforeEach(resetDb);

  it("reports the trial with INR plan prices", async () => {
    const admin = await makeAdmin();
    const b = await getBilling(admin);
    expect(b.subscription.plan).toBe("TRIAL");
    expect(b.limit).toBe(1);
    expect(b.plans.find((p) => p.key === "STARTER")?.pricePaise).toBe(99900);
    expect(b.plans.find((p) => p.key === "GROWTH")?.pricePaise).toBe(299900);
  });

  it("upgrading to Starter allows three open jobs, not four", async () => {
    const admin = await makeAdmin();
    const { sessionId } = await startCheckout(admin, "STARTER");
    await confirmCheckout(admin, sessionId);
    expect((await getBilling(admin)).subscription.plan).toBe("STARTER");
    expect(await db.auditEvent.count({ where: { action: "PLAN_CHANGED" } })).toBe(1);

    for (let i = 1; i <= 3; i++) await publishJob(admin, await newJob(admin, i));
    await expect(publishJob(admin, await newJob(admin, 4))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("a job credit lets a trial publish a second job", async () => {
    const admin = await makeAdmin();
    const { sessionId } = await startCheckout(admin, "JOB_CREDIT");
    await confirmCheckout(admin, sessionId);
    expect((await getBilling(admin)).activeCredits).toBe(1);
    await publishJob(admin, await newJob(admin, 1));
    await publishJob(admin, await newJob(admin, 2));
  });

  it("only admins can buy, and sessions can't be reused across orgs or tampered", async () => {
    const admin = await makeAdmin();
    const recruiter = await addMember(admin, "RECRUITER");
    await expect(startCheckout(recruiter, "GROWTH")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { sessionId } = await startCheckout(admin, "STARTER");
    const other = await makeAdmin("Other");
    await expect(confirmCheckout(other, sessionId)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(confirmCheckout(admin, sessionId.replace("STARTER", "GROWTH"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("confirming the same session twice does not double-apply", async () => {
    const admin = await makeAdmin();
    const { sessionId } = await startCheckout(admin, "JOB_CREDIT");
    await confirmCheckout(admin, sessionId);
    await confirmCheckout(admin, sessionId);
    expect(await db.jobCredit.count()).toBe(1);
  });
});

describe("dashboard service", () => {
  beforeEach(resetDb);

  it("counts applicants and only older APPLIED candidates as waiting", async () => {
    const admin = await makeAdmin();
    const jobId = await newJob(admin, 1);
    await publishJob(admin, jobId);
    const { slug } = await getJob(admin, jobId);
    const base = { consent: true as const, phone: "9876543210", city: "Pune", mustHaveAnswers: {}, answers: {} };
    await submitApplication(slug, { ...base, name: "Old One", email: "old@x.com" });
    await submitApplication(slug, { ...base, name: "New One", email: "new@x.com" });
    const old = await db.application.findFirstOrThrow({ where: { candidate: { emailHash: { not: "" } } }, orderBy: { createdAt: "asc" } });
    await db.application.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });

    const d = await getDashboard(admin);
    expect(d.openJobs[0]).toMatchObject({ applicants: 2, newToday: 1 });
    expect(d.waitingOnYou).toBe(1);
    expect(d.recentActivity.length).toBeGreaterThan(0);
  });

  it("restricts the audit log to admins and filters by action", async () => {
    const admin = await makeAdmin();
    await publishJob(admin, await newJob(admin, 1));
    const published = await listAudit(admin, { action: "JOB_PUBLISHED" });
    expect(published).toHaveLength(1);
    const recruiter = await addMember(admin, "RECRUITER");
    await expect(listAudit(recruiter, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists outbox messages for the org only", async () => {
    const admin = await makeAdmin();
    await db.message.create({ data: { orgId: admin.orgId, to: "a@x.com", subject: "Hi", body: "b", kind: "TEST" } });
    const other = await makeAdmin("Other");
    expect(await listOutbox(admin)).toHaveLength(1);
    expect(await listOutbox(other)).toHaveLength(0);
  });

  it("hides team invite links from non-admins so they can't claim the invited role", async () => {
    const admin = await makeAdmin();
    const recruiter = await addMember(admin, "RECRUITER");
    await inviteMember(admin, { email: "boss@test.dev", role: "ADMIN" });
    expect((await listOutbox(admin)).map((m) => m.kind)).toContain("INVITE_MEMBER");
    expect(await listOutbox(recruiter)).toHaveLength(0);
  });

  it("keeps candidate emails away from interviewers", async () => {
    const admin = await makeAdmin();
    const interviewer = await addMember(admin, "INTERVIEWER");
    await expect(listOutbox(interviewer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
