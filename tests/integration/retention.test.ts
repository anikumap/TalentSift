import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, getJob, publishJob } from "@/services/jobs";
import { submitApplication, type ApplicationInput } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import { inviteMember } from "@/services/auth";
import { confirmCheckout, startCheckout } from "@/services/billing";
import { previewExpired, purgeExpired, setRetentionDays } from "@/services/retention";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

const DAY = 86_400_000;
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

async function openJob(admin: Actor, title = "Home Caregiver") {
  const id = await createJobFromIntake(admin, { ...caregiverIntake, title });
  await publishJob(admin, id);
  return getJob(admin, id);
}

function input(job: Awaited<ReturnType<typeof getJob>>, email: string): ApplicationInput {
  return {
    consent: true,
    name: "Meena Iyer",
    email,
    phone: "+91 98765 43210",
    city: "Pune",
    mustHaveAnswers: Object.fromEntries(job.mustHaves.map((m) => [m.id, true])),
    answers: Object.fromEntries(job.questions.map((q) => [q.id, "I stay calm and tell the supervisor."])),
  };
}

/** Submit an application and backdate it (and its candidate) by `age` days. */
async function applyAged(job: Awaited<ReturnType<typeof getJob>>, email: string, age: number) {
  await submitApplication(job.slug, input(job, email));
  const app = await db.application.findFirstOrThrow({ where: { jobId: job.id }, orderBy: { createdAt: "desc" } });
  await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${daysAgo(age)}, "createdAt" = ${daysAgo(age)} WHERE "id" = ${app.id}`;
  await db.candidate.update({ where: { id: app.candidateId }, data: { createdAt: daysAgo(age) } });
  return app;
}

describe("retention service", () => {
  let admin: Actor;
  let job: Awaited<ReturnType<typeof getJob>>;

  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    job = await openJob(admin);
  });

  it("erases candidates whose every application is older than the period", async () => {
    const old = await applyAged(job, "old@x.com", 400);
    await applyAged(job, "new@x.com", 10);
    expect(await db.evaluation.count({ where: { applicationId: old.id } })).toBeGreaterThan(0);
    const [r] = await purgeExpired(NOW);
    expect(r).toMatchObject({ orgId: admin.orgId, candidates: 1, applications: 1 });
    expect(await db.candidate.count()).toBe(1);
    expect(await db.application.count()).toBe(1);
    expect(await db.evaluation.count({ where: { applicationId: old.id } })).toBe(0);
  });

  it("keeps a candidate exactly at the cutoff", async () => {
    await applyAged(job, "edge@x.com", 365);
    await db.application.updateMany({ data: { updatedAt: new Date(NOW.getTime() - 365 * DAY) } });
    expect(await purgeExpired(NOW)).toEqual([]);
    expect(await db.candidate.count()).toBe(1);
  });

  it("keeps a candidate whole if any of their applications is recent", async () => {
    await confirmCheckout(admin, (await startCheckout(admin, "GROWTH")).sessionId);
    const other = await openJob(admin, "Night Caregiver");
    await applyAged(job, "mixed@x.com", 400);
    await applyAged(other, "mixed@x.com", 5);
    expect(await purgeExpired(NOW)).toEqual([]);
    expect(await db.application.count()).toBe(2);
  });

  it("erases old candidate emails but keeps team invites and recent emails", async () => {
    const app = await applyAged(job, "old@x.com", 400);
    await db.application.update({ where: { id: app.id }, data: { stage: "SHORTLISTED" } });
    await changeStage(admin, app.id, "REJECTED", { code: "Position filled" });
    await db.message.updateMany({ data: { createdAt: daysAgo(400) } });
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${daysAgo(400)} WHERE "id" = ${app.id}`;
    await inviteMember(admin, { email: "new.member@test.dev", role: "RECRUITER" });
    await db.message.create({ data: { orgId: admin.orgId, to: "x@y.com", subject: "s", body: "b", kind: "CANDIDATE_INVITE" } });

    const [r] = await purgeExpired(NOW);
    expect(r.messages).toBe(1);
    expect(await db.message.count({ where: { kind: "INVITE_MEMBER" } })).toBe(1);
    expect(await db.message.count({ where: { kind: { startsWith: "CANDIDATE_" } } })).toBe(1);
  });

  it("writes one audit event and keeps the erased candidates' audit history", async () => {
    const app = await applyAged(job, "old@x.com", 400);
    const before = await db.auditEvent.count({ where: { entityId: app.id } });
    expect(before).toBeGreaterThan(0);
    await purgeExpired(NOW);
    const events = await db.auditEvent.findMany({ where: { action: "RETENTION_PURGE" } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].after!)).toMatchObject({ candidates: 1, applications: 1 });
    expect(await db.auditEvent.count({ where: { entityId: app.id } })).toBe(before);
  });

  it("strips free-text decision notes from the erased candidates' audit history, keeping reason codes", async () => {
    const gone = await applyAged(job, "old@x.com", 400);
    const kept = await applyAged(job, "new@x.com", 1);
    await changeStage(admin, gone.id, "REJECTED", { code: "Other", note: "Meena said she moved to Nagpur" });
    await changeStage(admin, kept.id, "REJECTED", { code: "Other", note: "Asha is overqualified" });
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${daysAgo(400)} WHERE "id" = ${gone.id}`;

    await purgeExpired(NOW);
    const goneEv = await db.auditEvent.findFirstOrThrow({ where: { entityId: gone.id, action: "STAGE_CHANGED" } });
    const keptEv = await db.auditEvent.findFirstOrThrow({ where: { entityId: kept.id, action: "STAGE_CHANGED" } });
    expect(goneEv.reason).toBe("Other");
    expect(keptEv.reason).toBe("Other — Asha is overqualified");
    const all = await db.auditEvent.findMany({ where: { entityId: gone.id } });
    expect(JSON.stringify(all)).not.toMatch(/Meena|Nagpur/);
  });

  it("erases nothing and writes nothing on a second run", async () => {
    await applyAged(job, "old@x.com", 400);
    await purgeExpired(NOW);
    expect(await purgeExpired(NOW)).toEqual([]);
    expect(await db.auditEvent.count({ where: { action: "RETENTION_PURGE" } })).toBe(1);
  });

  it("uses each organisation's own period and never touches another organisation", async () => {
    const other = await makeAdmin("Other Org");
    const otherJob = await openJob(other);
    await setRetentionDays(other, 1000);
    await applyAged(job, "a@x.com", 400);
    await applyAged(otherJob, "b@x.com", 400);
    const results = await purgeExpired(NOW);
    expect(results.map((r) => r.orgId)).toEqual([admin.orgId]);
    expect(await db.candidate.count({ where: { orgId: other.orgId } })).toBe(1);
    expect(await purgeExpired(NOW, other.orgId)).toEqual([]);
  });

  it("previews exactly what a run would erase", async () => {
    await applyAged(job, "old@x.com", 400);
    await applyAged(job, "new@x.com", 1);
    const preview = await previewExpired(admin, NOW);
    const [r] = await purgeExpired(NOW);
    expect({ candidates: preview.candidates, applications: preview.applications, messages: preview.messages }).toEqual({
      candidates: r.candidates,
      applications: r.applications,
      messages: r.messages,
    });
  });

  it("validates and audits retention changes, admin only", async () => {
    for (const bad of [29, 1096, 45.5]) await expect(setRetentionDays(admin, bad)).rejects.toMatchObject({ code: "VALIDATION" });
    const recruiter = await addMember(admin, "RECRUITER");
    await expect(setRetentionDays(recruiter, 90)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(previewExpired(recruiter)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setRetentionDays(admin, 90);
    expect((await db.organization.findUniqueOrThrow({ where: { id: admin.orgId } })).retentionDays).toBe(90);
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: "RETENTION_CHANGED" } });
    expect([JSON.parse(ev.before!), JSON.parse(ev.after!)]).toEqual([{ retentionDays: 365 }, { retentionDays: 90 }]);
  });
});
