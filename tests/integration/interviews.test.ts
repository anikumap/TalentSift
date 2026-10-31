import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, getJob, publishJob } from "@/services/jobs";
import { submitApplication } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import {
  addSlots,
  bookByToken,
  bookForCandidate,
  cancelByToken,
  cancelInterview,
  deleteSlot,
  getBookingPage,
  interviewIcsByToken,
  listMyInterviews,
  listSlots,
  setInterviewStatus,
} from "@/services/interviews";
import { purgeExpired } from "@/services/retention";
import { istDayKey } from "@/domain/interviews";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const inDays = (n: number) => istDayKey(new Date(Date.now() + n * DAY));

let admin: Actor;
let interviewer: Actor;
let jobId: string;
let slug: string;
let n = 0;

async function apply(): Promise<string> {
  n++;
  await submitApplication(slug, {
    consent: true,
    name: `Meena Iyer${n}`,
    email: `meena${n}@example.com`,
    phone: "9876543210",
    city: "Pune",
    mustHaveAnswers: {},
    answers: {},
  });
  return (await db.application.findFirstOrThrow({ where: { jobId }, orderBy: { createdAt: "desc" } })).id;
}

/** Apply, shortlist and move to Interview; returns the application ID and the booking token from the email. */
async function toInterview(): Promise<{ appId: string; token: string }> {
  const appId = await apply();
  await changeStage(admin, appId, "SHORTLISTED");
  await changeStage(admin, appId, "INTERVIEW");
  const mail = await db.message.findFirstOrThrow({ where: { kind: "CANDIDATE_INTERVIEW_LINK" }, orderBy: { createdAt: "desc" } });
  const token = /\/book\/([\w-]+)/.exec(mail.body)?.[1] ?? "";
  return { appId, token };
}

async function slotsTomorrow(count = 4) {
  await addSlots(admin, jobId, {
    date: inDays(2),
    from: "10:00",
    to: `${String(10 + Math.floor((count * 30) / 60)).padStart(2, "0")}:${(count * 30) % 60 === 0 ? "00" : "30"}`,
    lengthMin: 30,
    interviewerId: interviewer.id,
    mode: "IN_PERSON",
    location: "Sunrise Care office, Kothrud",
  });
  return db.interviewSlot.findMany({ where: { jobId }, orderBy: { startsAt: "asc" } });
}

describe("interviews service", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    interviewer = await addMember(admin, "INTERVIEWER");
    jobId = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, jobId);
    slug = (await getJob(admin, jobId)).slug;
  });

  it("adds back-to-back slots in IST and audits once", async () => {
    const created = await addSlots(admin, jobId, {
      date: inDays(2), from: "10:00", to: "12:00", lengthMin: 30, interviewerId: interviewer.id, mode: "PHONE", location: "We'll call you",
    });
    expect(created).toBe(4);
    const slots = await listSlots(admin, jobId);
    expect(slots).toHaveLength(4);
    expect(slots[0].startsAt.toISOString().slice(11, 16)).toBe("04:30");
    expect(slots[0].interviewerName).toBe(interviewer.name);
    expect(slots[0].booked).toBeNull();
    expect(await db.auditEvent.count({ where: { action: "INTERVIEW_SLOTS_ADDED" } })).toBe(1);
  });

  it("rejects overlapping, past, foreign-interviewer, over-32 and interviewer-role slot creation", async () => {
    const base = { date: inDays(2), from: "10:00", to: "11:00", lengthMin: 30, interviewerId: interviewer.id, mode: "IN_PERSON" as const, location: "Office" };
    await addSlots(admin, jobId, base);
    await expect(addSlots(admin, jobId, { ...base, from: "10:30", to: "11:30" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addSlots(admin, jobId, { ...base, date: inDays(-1) })).rejects.toMatchObject({ code: "VALIDATION" });
    const stranger = await makeAdmin("Other Org");
    await expect(addSlots(admin, jobId, { ...base, date: inDays(3), interviewerId: stranger.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addSlots(admin, jobId, { ...base, date: inDays(4), from: "06:00", to: "22:00", lengthMin: 15 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addSlots(interviewer, jobId, { ...base, date: inDays(5) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addSlots(stranger, jobId, { ...base, date: inDays(5) })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moving to Interview emails a booking link, or says we'll call when there are no slots", async () => {
    const first = await toInterview();
    const noSlots = await db.message.findFirstOrThrow({ where: { kind: "CANDIDATE_INTERVIEW_LINK" } });
    expect(noSlots.body).toMatch(/call you/);
    expect(first.token).toBe("");
    await slotsTomorrow();
    const { token } = await toInterview();
    expect(token).not.toBe("");
    expect((await getBookingPage(token)).state).toBe("choose");
  });

  it("candidate books by token", async () => {
    const slots = await slotsTomorrow();
    const { appId, token } = await toInterview();
    const before = (await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await bookByToken(token, slots[1].id);
    const iv = await db.interview.findFirstOrThrow({ where: { applicationId: appId } });
    expect(iv).toMatchObject({ bookedBy: "CANDIDATE", status: "SCHEDULED", slotId: slots[1].id, interviewerId: interviewer.id });
    expect(await db.message.count({ where: { kind: "CANDIDATE_INTERVIEW_CONFIRMED" } })).toBe(1);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt.getTime()).toBeGreaterThan(before.getTime());
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: "INTERVIEW_BOOKED" } });
    expect(ev).toMatchObject({ entityId: appId, entityType: "Application", actorName: "Candidate", actorId: null });
    const page = await getBookingPage(token);
    expect(page.state).toBe("booked");
    if (page.state === "booked") {
      expect(page.interview.location).toBe("Sunrise Care office, Kothrud");
      expect(page.interview.canChange).toBe(true);
      expect(page.slots.map((s) => s.id)).not.toContain(slots[1].id);
    }
  });

  it("race on one slot: only one booking wins", async () => {
    const [slot] = await slotsTomorrow();
    const a = await toInterview();
    const b = await toInterview();
    const results = await Promise.allSettled([bookByToken(a.token, slot.id), bookByToken(b.token, slot.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "CONFLICT" });
    expect(await db.interview.count()).toBe(1);
  });

  it("change time inside 12h is refused, outside is allowed and frees the old slot", async () => {
    const slots = await slotsTomorrow();
    const { token } = await toInterview();
    await bookByToken(token, slots[0].id);
    await bookByToken(token, slots[2].id);
    const ivs = await db.interview.findMany({ orderBy: { createdAt: "asc" } });
    expect(ivs.map((i) => [i.status, i.slotId])).toEqual([["CANCELLED", null], ["SCHEDULED", slots[2].id]]);
    await db.interview.update({ where: { id: ivs[1].id }, data: { startsAt: new Date(Date.now() + 11 * HOUR) } });
    await expect(bookByToken(token, slots[3].id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(cancelByToken(token)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("candidate can cancel, which frees the slot and emails", async () => {
    const slots = await slotsTomorrow();
    const { token } = await toInterview();
    await bookByToken(token, slots[0].id);
    await cancelByToken(token);
    expect((await db.interview.findFirstOrThrow()).status).toBe("CANCELLED");
    expect((await getBookingPage(token)).state).toBe("choose");
    expect(await db.message.count({ where: { kind: "CANDIDATE_INTERVIEW_CANCELLED" } })).toBe(1);
  });

  it("invalid and expired tokens", async () => {
    await slotsTomorrow();
    const { token } = await toInterview();
    expect((await getBookingPage("nope")).state).toBe("invalid");
    await db.candidateLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getBookingPage(token)).state).toBe("invalid");
    await expect(bookByToken(token, "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("closed application: rejected candidates can't book", async () => {
    const slots = await slotsTomorrow();
    const { appId, token } = await toInterview();
    await changeStage(admin, appId, "REJECTED", { code: "Position filled" });
    expect((await getBookingPage(token)).state).toBe("closed");
    await expect(bookByToken(token, slots[0].id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses slots in the past and slots of another job", async () => {
    const slots = await slotsTomorrow();
    const { token } = await toInterview();
    await db.interviewSlot.update({ where: { id: slots[0].id }, data: { startsAt: new Date(Date.now() - HOUR) } });
    await expect(bookByToken(token, slots[0].id)).rejects.toMatchObject({ code: "CONFLICT" });
    const otherJob = await createJobFromIntake(admin, { ...caregiverIntake, title: "Night Caregiver" });
    await addSlots(admin, otherJob, { date: inDays(3), from: "10:00", to: "10:30", lengthMin: 30, interviewerId: interviewer.id, mode: "PHONE", location: "x" });
    const foreign = await db.interviewSlot.findFirstOrThrow({ where: { jobId: otherJob } });
    await expect(bookByToken(token, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("team booking, status and cancel; interviewers can't manage", async () => {
    const slots = await slotsTomorrow();
    const { appId } = await toInterview();
    await expect(bookForCandidate(interviewer, appId, slots[0].id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await bookForCandidate(admin, appId, slots[0].id);
    const iv = await db.interview.findFirstOrThrow();
    expect(iv.bookedBy).toBe("TEAM");
    await expect(deleteSlot(admin, slots[0].id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(setInterviewStatus(admin, iv.id, "COMPLETED")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(cancelInterview(interviewer, iv.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await cancelInterview(admin, iv.id, "Interviewer unwell");
    expect((await db.interview.findUniqueOrThrow({ where: { id: iv.id } })).slotId).toBeNull();
    await deleteSlot(admin, slots[0].id);
    expect(await db.interviewSlot.count()).toBe(3);
  });

  it("marks past interviews completed or no-show", async () => {
    const slots = await slotsTomorrow();
    const { appId } = await toInterview();
    await bookForCandidate(admin, appId, slots[0].id);
    const iv = await db.interview.findFirstOrThrow();
    await db.interview.update({ where: { id: iv.id }, data: { startsAt: new Date(Date.now() - HOUR) } });
    await setInterviewStatus(admin, iv.id, "NO_SHOW");
    expect((await db.interview.findUniqueOrThrow({ where: { id: iv.id } })).status).toBe("NO_SHOW");
    expect(await db.auditEvent.count({ where: { action: "INTERVIEW_STATUS_CHANGED", entityId: appId } })).toBe(1);
  });

  it("lists my interviews: upcoming and feedback due", async () => {
    const slots = await slotsTomorrow();
    const a = await toInterview();
    const b = await toInterview();
    await bookForCandidate(admin, a.appId, slots[0].id);
    await bookForCandidate(admin, b.appId, slots[1].id);
    const past = await db.interview.findFirstOrThrow({ where: { applicationId: b.appId } });
    await db.interview.update({ where: { id: past.id }, data: { startsAt: new Date(Date.now() - HOUR) } });
    const mine = await listMyInterviews(interviewer, { mineOnly: true });
    expect(mine.upcoming.map((r) => r.appId)).toEqual([a.appId]);
    expect(mine.feedbackDue.map((r) => r.appId)).toEqual([b.appId]);
    const adminMine = await listMyInterviews(admin, { mineOnly: true });
    expect(adminMine.upcoming).toHaveLength(0);
    expect((await listMyInterviews(admin, { mineOnly: false })).upcoming).toHaveLength(1);
  });

  it("ics by token contains the location only after booking", async () => {
    const slots = await slotsTomorrow();
    const { token } = await toInterview();
    expect(await interviewIcsByToken(token)).toBeNull();
    await bookByToken(token, slots[0].id);
    const ics = await interviewIcsByToken(token);
    expect(ics).toContain("LOCATION:Sunrise Care office\\, Kothrud");
  });

  it("retention erases interviews and links", async () => {
    const slots = await slotsTomorrow();
    const { appId, token } = await toInterview();
    await bookByToken(token, slots[0].id);
    const old = new Date(Date.now() - 400 * DAY);
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${old}, "createdAt" = ${old} WHERE "id" = ${appId}`;
    await db.candidate.updateMany({ data: { createdAt: old } });
    await purgeExpired();
    expect(await db.interview.count()).toBe(0);
    expect(await db.candidateLink.count()).toBe(0);
    expect(await db.interviewSlot.count()).toBe(4);
  });
});
