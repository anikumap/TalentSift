import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, publishJob } from "@/services/jobs";
import { submitApplication } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import { addSlots, bookForCandidate, cancelInterview, setInterviewStatus } from "@/services/interviews";
import { getFeedback, submitFeedback } from "@/services/feedback";
import { istDayKey } from "@/domain/interviews";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

const DAY = 86_400_000;
const HOUR = 3_600_000;

let admin: Actor;
let ivA: Actor;
let ivB: Actor;
let jobId: string;
let appId: string;
let skills: { id: string; name: string }[];

async function interviewWith(interviewer: Actor, offsetDays: number): Promise<string> {
  await addSlots(admin, jobId, {
    date: istDayKey(new Date(Date.now() + offsetDays * DAY)),
    from: "10:00",
    to: "10:30",
    lengthMin: 30,
    interviewerId: interviewer.id,
    mode: "PHONE",
    location: "We'll call you",
  });
  const slot = await db.interviewSlot.findFirstOrThrow({ where: { interviewerId: interviewer.id, interview: null }, orderBy: { createdAt: "desc" } });
  await bookForCandidate(admin, appId, slot.id);
  return (await db.interview.findFirstOrThrow({ where: { slotId: slot.id } })).id;
}

/** Moves the interview's start one hour into the past, as if it already happened. */
const happened = (interviewId: string) =>
  db.interview.update({ where: { id: interviewId }, data: { startsAt: new Date(Date.now() - HOUR) } });

const allRatings = (r = 3) => Object.fromEntries(skills.map((s) => [s.id, r]));
const input = (over: Partial<Parameters<typeof submitFeedback>[2]> = {}) => ({
  ratings: allRatings(),
  recommendation: "YES" as const,
  notes: "Calm, explained the medicine schedule clearly.",
  ...over,
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => e.code as string);

describe("feedback service", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    ivA = await addMember(admin, "INTERVIEWER");
    ivB = await addMember(admin, "INTERVIEWER");
    jobId = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, jobId);
    const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { scorecard: { include: { skills: { orderBy: { order: "asc" } } } } } });
    skills = job.scorecard!.skills.map((s) => ({ id: s.id, name: s.name }));
    await submitApplication(job.slug, {
      consent: true,
      name: "Meena Iyer",
      email: "meena@example.com",
      phone: "9876543210",
      city: "Pune",
      mustHaveAnswers: {},
      answers: {},
    });
    appId = (await db.application.findFirstOrThrow({ where: { jobId } })).id;
    await changeStage(admin, appId, "SHORTLISTED");
    await changeStage(admin, appId, "INTERVIEW");
  });

  it("only the assigned interviewer, only after the start", async () => {
    const iv = await interviewWith(ivA, 2);
    expect(await code(submitFeedback(ivA, iv, input()))).toBe("VALIDATION");
    await happened(iv);
    expect(await code(submitFeedback(ivB, iv, input()))).toBe("FORBIDDEN");
    expect(await code(submitFeedback(admin, iv, input()))).toBe("FORBIDDEN");
    expect(await code(submitFeedback(ivA, iv, input()))).toBe("ok");
  });

  it("requires a 0–4 rating for every current scorecard skill", async () => {
    const iv = await interviewWith(ivA, 2);
    await happened(iv);
    const missing = allRatings();
    delete missing[skills[0].id];
    expect(await code(submitFeedback(ivA, iv, input({ ratings: missing })))).toBe("VALIDATION");
    expect(await code(submitFeedback(ivA, iv, input({ ratings: { ...allRatings(), [skills[0].id]: 5 } })))).toBe("VALIDATION");
    expect(await code(submitFeedback(ivA, iv, input({ ratings: { ...allRatings(), [skills[0].id]: 1.5 } })))).toBe("VALIDATION");
    expect(await code(submitFeedback(ivA, iv, input({ recommendation: "MAYBE" as "YES" })))).toBe("VALIDATION");
    expect(await code(submitFeedback(ivA, iv, input({ notes: "x".repeat(2001) })))).toBe("VALIDATION");
    expect(await code(submitFeedback(ivA, iv, input({ ratings: allRatings(0) })))).toBe("ok");
  });

  it("stores a name snapshot that survives removing the skill", async () => {
    const iv = await interviewWith(ivA, 2);
    await happened(iv);
    await submitFeedback(ivA, iv, input());
    await db.skill.delete({ where: { id: skills[0].id } });
    const { visible } = await getFeedback(admin, appId);
    expect(visible[0].ratings.map((r) => r.name)).toContain(skills[0].name);
    expect(visible[0].ratings).toHaveLength(skills.length);
  });

  it("marks the interview completed, bumps activity, audits without notes", async () => {
    const iv = await interviewWith(ivA, 2);
    await happened(iv);
    const before = (await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await submitFeedback(ivA, iv, input({ notes: "  Secret-ish remark about Meena  " }));
    const row = await db.interview.findUniqueOrThrow({ where: { id: iv }, include: { feedback: true } });
    expect(row.status).toBe("COMPLETED");
    expect(row.feedback!.notes).toBe("Secret-ish remark about Meena");
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt.getTime()).toBeGreaterThan(before.getTime());
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: "FEEDBACK_SUBMITTED" } });
    expect(ev.entityType).toBe("Application");
    expect(ev.entityId).toBe(appId);
    expect(JSON.stringify(ev)).not.toContain("Secret-ish");
  });

  it("cannot submit twice", async () => {
    const iv = await interviewWith(ivA, 2);
    await happened(iv);
    await submitFeedback(ivA, iv, input());
    expect(await code(submitFeedback(ivA, iv, input()))).toBe("CONFLICT");
  });

  it("independent visibility", async () => {
    // Round one with A happens and is marked done by the recruiter; round two with B follows.
    const a = await interviewWith(ivA, 2);
    await happened(a);
    await setInterviewStatus(admin, a, "COMPLETED");
    const b = await interviewWith(ivB, 3);
    await happened(b);
    await submitFeedback(ivB, b, input({ recommendation: "NO" }));

    const beforeA = await getFeedback(ivA, appId);
    expect(beforeA.visible).toHaveLength(0);
    expect(beforeA.hiddenCount).toBe(1);
    expect(beforeA.mineDue).toEqual([a]);

    const rec = await getFeedback(admin, appId);
    expect(rec.visible).toHaveLength(1);
    expect(rec.hiddenCount).toBe(0);
    expect(rec.mineDue).toEqual([]);

    await submitFeedback(ivA, a, input());
    const afterA = await getFeedback(ivA, appId);
    expect(afterA.visible).toHaveLength(2);
    expect(afterA.hiddenCount).toBe(0);
    expect(afterA.mineDue).toEqual([]);
  });

  it("cancelled interviews take no feedback", async () => {
    const iv = await interviewWith(ivA, 2);
    await cancelInterview(admin, iv);
    await happened(iv);
    expect(await code(submitFeedback(ivA, iv, input()))).toBe("VALIDATION");
    expect((await getFeedback(ivA, appId)).mineDue).toEqual([]);
  });

  it("other organisations see nothing", async () => {
    const other = await makeAdmin("Other Org");
    expect(await code(getFeedback(other, appId))).toBe("NOT_FOUND");
  });
});
