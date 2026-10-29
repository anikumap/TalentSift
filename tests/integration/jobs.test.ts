import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createJobFromIntake,
  getJob,
  updateScorecard,
  updateJobDetails,
  publishJob,
  closeJob,
  listJobs,
  getOpenJobBySlug,
  previewScorecard,
} from "@/services/jobs";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

describe("jobs service", () => {
  beforeEach(resetDb);

  it("previews a scorecard without saving anything", async () => {
    const card = await previewScorecard({ title: "Warehouse Associate" });
    expect(card.roleFamily).toBe("warehouse");
    expect(await db.job.count()).toBe(0);
  });

  it("creates a draft job with a scorecard, questions and an ad", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    const job = await getJob(admin, id);
    expect(job.status).toBe("DRAFT");
    expect(job.skills.length).toBeGreaterThanOrEqual(3);
    expect(job.skills.reduce((a, s) => a + s.weight, 0)).toBe(100);
    expect(job.questions).toHaveLength(3);
    expect(job.questions.every((q) => q.skillIds.length > 0)).toBe(true);
    expect(job.adText).toContain("Home Caregiver");
    expect(job.slug).toMatch(/^home-caregiver-[0-9a-f]{6}$/);
  });

  it("validates intake answers", async () => {
    const admin = await makeAdmin();
    await expect(createJobFromIntake(admin, { ...caregiverIntake, title: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createJobFromIntake(admin, { ...caregiverIntake, payMin: 30000, payMax: 20000 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("requires 3 to 6 skills and normalizes weights, with an audit entry", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    const skill = (n: string) => ({ name: n, description: "d", weight: 10, keywords: ["k"] });

    await expect(
      updateScorecard(admin, id, { skills: [skill("A"), skill("B")], mustHaves: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await updateScorecard(admin, id, { skills: [skill("A"), skill("B"), skill("C")], mustHaves: [] });
    const job = await getJob(admin, id);
    expect(job.skills.map((s) => s.weight)).toEqual([34, 33, 33]);
    const event = await db.auditEvent.findFirst({
      where: { action: "SCORECARD_UPDATED", entityId: id, reason: null },
    });
    expect(event?.before).toBeTruthy();
    expect(JSON.parse(event!.after!).skills).toHaveLength(3);
  });

  it("keeps question-skill links when skills are renamed in place", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    const job = await getJob(admin, id);
    await updateScorecard(admin, id, {
      skills: job.skills.map((s, i) => ({ ...s, name: i === 0 ? "Renamed" : s.name })),
      mustHaves: job.mustHaves,
    });
    const after = await getJob(admin, id);
    expect(after.skills[0].id).toBe(job.skills[0].id);
    expect(after.questions[0].skillIds).toEqual(job.questions[0].skillIds);
  });

  it("hides jobs from other organisations", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    const stranger = await makeAdmin("Other Org");
    await expect(getJob(stranger, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updates ad text and recomputes wording flags", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    await updateJobDetails(admin, id, { adText: "We want a young rockstar" });
    const job = await getJob(admin, id);
    expect(job.wordingFlags.map((f) => f.phrase)).toEqual(["young", "rockstar"]);
  });

  it("enforces trial limits on publishing and frees a slot on close", async () => {
    const admin = await makeAdmin();
    const a = await createJobFromIntake(admin, caregiverIntake);
    const b = await createJobFromIntake(admin, { ...caregiverIntake, title: "Night Caregiver" });

    await publishJob(admin, a);
    expect((await getOpenJobBySlug((await getJob(admin, a)).slug))?.id).toBe(a);
    await expect(publishJob(admin, b)).rejects.toMatchObject({ code: "LIMIT" });

    await closeJob(admin, a);
    expect(await getOpenJobBySlug((await getJob(admin, a)).slug)).toBeNull();
    await publishJob(admin, b);
    expect(await db.auditEvent.count({ where: { action: "JOB_PUBLISHED" } })).toBe(2);
    expect(await db.auditEvent.count({ where: { action: "JOB_CLOSED" } })).toBe(1);
  });

  it("blocks publishing when the trial has expired", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    await db.subscription.update({ where: { orgId: admin.orgId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await expect(publishJob(admin, id)).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("uses a job credit for an extra slot and ties it to the job", async () => {
    const admin = await makeAdmin();
    const a = await createJobFromIntake(admin, caregiverIntake);
    const b = await createJobFromIntake(admin, { ...caregiverIntake, title: "Night Caregiver" });
    await db.jobCredit.create({ data: { orgId: admin.orgId, expiresAt: new Date(Date.now() + 86_400_000) } });
    await publishJob(admin, a);
    await publishJob(admin, b);
    expect((await db.jobCredit.findFirst())?.jobId).toBe(b);
  });

  it("checks permissions", async () => {
    const admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    const manager = await addMember(admin, "HIRING_MANAGER");
    const interviewer = await addMember(admin, "INTERVIEWER");
    await expect(publishJob(manager, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createJobFromIntake(interviewer, caregiverIntake)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getJob(interviewer, id)).id).toBe(id);
  });

  it("lists jobs with applicant counts", async () => {
    const admin = await makeAdmin();
    await createJobFromIntake(admin, caregiverIntake);
    const jobs = await listJobs(admin);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "Home Caregiver", applicants: 0, status: "DRAFT" });
  });
});
