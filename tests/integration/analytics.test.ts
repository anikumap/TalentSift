import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, getJob, publishJob } from "@/services/jobs";
import { submitApplication, type ApplicationInput } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import { getAnalytics } from "@/services/analytics";
import { getFairnessReport } from "@/services/fairness";
import type { Actor } from "@/lib/rbac";
import type { SelfIdAnswers } from "@/domain/selfid";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

let admin: Actor;
let job: Awaited<ReturnType<typeof getJob>>;
let n = 0;

async function apply(selfId?: SelfIdAnswers): Promise<string> {
  const input: ApplicationInput = {
    consent: true,
    name: "Asha Rao",
    email: `c${n++}@x.com`,
    phone: "+91 98765 43210",
    city: "Pune",
    mustHaveAnswers: Object.fromEntries(job.mustHaves.map((m) => [m.id, true])),
    answers: Object.fromEntries(job.questions.map((q) => [q.id, "I stay calm and tell the supervisor."])),
    selfId,
  };
  await submitApplication(job.slug, input);
  return (await db.application.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).id;
}

describe("analytics and fairness services", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, id);
    job = await getJob(admin, id);
  });

  it("is empty but well-formed for a new organisation", async () => {
    const a = await getAnalytics(admin, { period: "all" });
    expect(a.total).toBe(0);
    expect(a.funnel.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
    expect([a.medianDaysToDecision, a.medianDaysToHire]).toEqual([null, null]);
    expect(a.scoreBuckets).toEqual([0, 0, 0, 0, 0]);
  });

  it("counts a candidate rejected at Interview as having reached Interview", async () => {
    const a1 = await apply();
    await apply();
    await apply();
    await changeStage(admin, a1, "SHORTLISTED");
    await changeStage(admin, a1, "INTERVIEW");
    await changeStage(admin, a1, "REJECTED", { code: "Position filled" });

    const a = await getAnalytics(admin, { period: "all", jobId: job.id });
    expect(a.total).toBe(3);
    expect(a.funnel.map((s) => s.count)).toEqual([3, 1, 1, 0, 0]);
    expect(a.rejectionReasons).toEqual([{ reason: "Position filled", count: 1 }]);
    expect(a.medianDaysToDecision).not.toBeNull();
    expect(a.scoreBuckets.reduce((x, y) => x + y, 0)).toBe(3);
  });

  it("flags a group shortlisted at under four-fifths the rate of another", async () => {
    for (let i = 0; i < 6; i++) {
      const id = await apply({ gender: "woman" });
      await changeStage(admin, id, i < 5 ? "SHORTLISTED" : "REJECTED", i < 5 ? undefined : { code: "Other" });
    }
    for (let i = 0; i < 6; i++) {
      const id = await apply({ gender: "man" });
      await changeStage(admin, id, i < 2 ? "SHORTLISTED" : "REJECTED", i < 2 ? undefined : { code: "Other" });
    }
    const r = await getFairnessReport(admin, {});
    expect([r.responded, r.total]).toEqual([12, 12]);
    const gender = r.characteristics.find((c) => c.key === "gender")!;
    expect(gender.comparable).toBe(true);
    const shortlisted = gender.stages.find((s) => s.stage === "SHORTLISTED")!.rates;
    expect(shortlisted.find((g) => g.group === "man")).toMatchObject({ flagged: true });
    expect(shortlisted.find((g) => g.group === "man")!.ratio).toBeCloseTo(0.4);
    expect(shortlisted.find((g) => g.group === "woman")).toMatchObject({ flagged: false, ratio: 1 });
    expect(r.characteristics.find((c) => c.key === "age")!.comparable).toBe(false);
  });

  it("counts recent untouched applications as not yet eligible for fairness", async () => {
    for (let i = 0; i < 5; i++) await apply({ gender: "woman" });
    const gender = (await getFairnessReport(admin, {})).characteristics.find((c) => c.key === "gender")!;
    expect(gender.stages[0].rates).toEqual([]);
  });

  it("restricts who can see each report", async () => {
    const interviewer = await addMember(admin, "INTERVIEWER");
    const manager = await addMember(admin, "HIRING_MANAGER");
    await expect(getAnalytics(interviewer, { period: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getAnalytics(manager, { period: "all" })).resolves.toBeTruthy();
    await expect(getFairnessReport(manager, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
