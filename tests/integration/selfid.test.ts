import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { createJobFromIntake, getJob, publishJob } from "@/services/jobs";
import { getApplicationDetail, listShortlist, submitApplication, type ApplicationInput } from "@/services/applications";
import { purgeExpired } from "@/services/retention";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { caregiverIntake, makeAdmin } from "../setup/fixtures";

let admin: Actor;
let job: Awaited<ReturnType<typeof getJob>>;

const input = (over: Partial<ApplicationInput> = {}): ApplicationInput => ({
  consent: true,
  name: "Meena Iyer",
  email: `m${Math.random()}@x.com`,
  phone: "+91 98765 43210",
  city: "Pune",
  mustHaveAnswers: Object.fromEntries(job.mustHaves.map((m) => [m.id, true])),
  answers: Object.fromEntries(job.questions.map((q) => [q.id, "I stay calm and tell the supervisor."])),
  ...over,
});

describe("optional self-ID", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    const id = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, id);
    job = await getJob(admin, id);
  });

  it("stores answered questions encrypted and skips unanswered ones", async () => {
    await submitApplication(job.slug, input({ selfId: { gender: "woman", age: "25_34" } }));
    const [row] = await db.selfId.findMany();
    expect(row.genderEnc).not.toContain("woman");
    expect(decrypt(row.genderEnc!)).toBe("woman");
    expect(decrypt(row.ageEnc!)).toBe("25_34");
    expect(row.disabilityEnc).toBeNull();
  });

  it("stores nothing when the candidate skips it", async () => {
    await submitApplication(job.slug, input());
    await submitApplication(job.slug, input({ selfId: {} }));
    expect(await db.selfId.count()).toBe(0);
  });

  it("rejects values outside the option lists", async () => {
    await expect(submitApplication(job.slug, input({ selfId: { gender: "x" as never } }))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("never shows up in what reviewers see", async () => {
    await submitApplication(job.slug, input({ selfId: { gender: "woman", disability: "yes" } }));
    const [app] = await db.application.findMany();
    const seen = JSON.stringify([await listShortlist(admin, job.id, {}), await getApplicationDetail(admin, app.id)]);
    expect(seen).not.toMatch(/woman|genderEnc|disability|selfId/i);
  });

  it("is erased with the application by the retention job", async () => {
    await submitApplication(job.slug, input({ selfId: { gender: "man" } }));
    const old = new Date(Date.now() - 400 * 86_400_000);
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${old}`;
    await db.candidate.updateMany({ data: { createdAt: old } });
    await purgeExpired();
    expect(await db.selfId.count()).toBe(0);
  });
});
