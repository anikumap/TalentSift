import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, getJob, publishJob } from "@/services/jobs";
import { submitApplication, getApplicationDetail } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

let admin: Actor;
let appId: string;

describe("decisions service", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    const jobId = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, jobId);
    const job = await getJob(admin, jobId);
    await submitApplication(job.slug, {
      consent: true,
      name: "Meena Iyer",
      email: "meena@example.com",
      phone: "9876543210",
      city: "Pune",
      mustHaveAnswers: {},
      answers: {},
    });
    appId = (await db.application.findFirstOrThrow()).id;
  });

  it("advancing to shortlisted reveals identity, audits twice and emails an invite", async () => {
    await changeStage(admin, appId, "SHORTLISTED");
    const app = await db.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.stage).toBe("SHORTLISTED");
    expect(app.revealed).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: appId, action: "STAGE_CHANGED" } })).toBe(1);
    expect(await db.auditEvent.count({ where: { entityId: appId, action: "IDENTITY_REVEALED" } })).toBe(1);
    const mail = await db.message.findFirstOrThrow({ where: { kind: "CANDIDATE_INVITE" } });
    expect(mail.to).toBe("meena@example.com");
    expect((await getApplicationDetail(admin, appId)).contact?.name).toBe("Meena Iyer");
  });

  it("requires a reason to reject and changes nothing without one", async () => {
    await expect(changeStage(admin, appId, "REJECTED")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).stage).toBe("APPLIED");
    expect(await db.auditEvent.count({ where: { action: "STAGE_CHANGED" } })).toBe(0);
  });

  it("rejects with a reason, records it and sends a respectful email without the score", async () => {
    await changeStage(admin, appId, "REJECTED", { code: "Position filled", note: "Hired internally" });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: "STAGE_CHANGED" } });
    expect(event.reason).toBe("Position filled — Hired internally");
    expect(event.actorId).toBe(admin.id);
    const mail = await db.message.findFirstOrThrow({ where: { kind: "CANDIDATE_REJECTION" } });
    expect(mail.body).toMatch(/thank you/i);
    expect(mail.body).not.toMatch(/score|\/100/i);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).revealed).toBe(false);
  });

  it("refuses unknown reject reasons", async () => {
    await expect(
      changeStage(admin, appId, "REJECTED", { code: "Too old" as "Other" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("does not let interviewers change stages", async () => {
    const interviewer = await addMember(admin, "INTERVIEWER");
    await expect(changeStage(interviewer, appId, "SHORTLISTED")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses moves out of a final stage", async () => {
    await changeStage(admin, appId, "REJECTED", { code: "Candidate withdrew" });
    await expect(changeStage(admin, appId, "APPLIED")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("allows on-hold candidates to jump to interview", async () => {
    await changeStage(admin, appId, "ON_HOLD");
    await changeStage(admin, appId, "INTERVIEW");
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).stage).toBe("INTERVIEW");
  });

  it("hides applications from other organisations", async () => {
    const stranger = await makeAdmin("Other");
    await expect(changeStage(stranger, appId, "SHORTLISTED")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
