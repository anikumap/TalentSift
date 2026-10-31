import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { createJobFromIntake, publishJob } from "@/services/jobs";
import { submitApplication } from "@/services/applications";
import { changeStage } from "@/services/decisions";
import { createOffer, getOfferPage, getOffersForApp, markHired, respondToOffer, withdrawOffer } from "@/services/offers";
import { purgeExpired } from "@/services/retention";
import { istDayKey } from "@/domain/interviews";
import type { Actor } from "@/lib/rbac";
import { resetDb } from "../setup/db";
import { addMember, caregiverIntake, makeAdmin } from "../setup/fixtures";

const DAY = 86_400_000;
const inDays = (n: number) => istDayKey(new Date(Date.now() + n * DAY));
const input = (over: Partial<Parameters<typeof createOffer>[2]> = {}) => ({
  monthlyPay: 21357,
  startDate: inDays(7),
  respondBy: inDays(3),
  terms: "Six-day week, one paid leave a month.",
  ...over,
});
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => e.code as string);

let admin: Actor;
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

async function atInterview(): Promise<string> {
  const appId = await apply();
  await changeStage(admin, appId, "SHORTLISTED");
  await changeStage(admin, appId, "INTERVIEW");
  return appId;
}

async function offerToken(): Promise<string> {
  const mail = await db.message.findFirstOrThrow({ where: { kind: "CANDIDATE_OFFER" }, orderBy: { createdAt: "desc" } });
  return /\/offer\/([\w-]+)/.exec(mail.body)?.[1] ?? "";
}

const stage = async (appId: string) => (await db.application.findUniqueOrThrow({ where: { id: appId } })).stage;

describe("offers service", () => {
  beforeEach(async () => {
    await resetDb();
    admin = await makeAdmin();
    jobId = await createJobFromIntake(admin, caregiverIntake);
    await publishJob(admin, jobId);
    slug = (await db.job.findUniqueOrThrow({ where: { id: jobId } })).slug;
  });

  it("creates an offer at Interview, moves to Offer, emails a link, all-or-nothing", async () => {
    const appId = await atInterview();
    expect(await code(createOffer(admin, appId, input({ monthlyPay: 0 })))).toBe("VALIDATION");
    expect(await stage(appId)).toBe("INTERVIEW");
    expect(await db.offer.count()).toBe(0);

    const offerId = await createOffer(admin, appId, input());
    expect(await stage(appId)).toBe("OFFER");
    const offer = await db.offer.findUniqueOrThrow({ where: { id: offerId } });
    expect(offer.status).toBe("SENT");
    expect(offer.monthlyPay).toBe(21357);
    expect(await db.candidateLink.count({ where: { applicationId: appId, purpose: "OFFER" } })).toBe(1);
    const page = await getOfferPage(await offerToken());
    expect(page.state).toBe("open");
    if (page.state === "open") {
      expect(page.letter.monthlyPay).toBe(21357);
      expect(page.letter.jobTitle).toBe("Home Caregiver");
      expect(page.letter.candidateName).toBe(`Meena Iyer${n}`);
    }
    const sent = await db.auditEvent.findFirstOrThrow({ where: { action: "OFFER_SENT" } });
    expect(sent.entityId).toBe(appId);
    expect(JSON.stringify(sent)).not.toContain("21357");
  });

  it("refuses from Shortlisted, refuses a second live offer, refuses interviewer role", async () => {
    const early = await apply();
    await changeStage(admin, early, "SHORTLISTED");
    expect(await code(createOffer(admin, early, input()))).toBe("VALIDATION");

    const appId = await atInterview();
    await createOffer(admin, appId, input());
    expect(await code(createOffer(admin, appId, input()))).toBe("CONFLICT");

    const interviewer = await addMember(admin, "INTERVIEWER");
    const other = await atInterview();
    expect(await code(createOffer(interviewer, other, input()))).toBe("FORBIDDEN");
  });

  it("accept records the typed name, bumps activity and audits without salary", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    const token = await offerToken();
    const before = (await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt;
    await new Promise((r) => setTimeout(r, 5));

    expect(await code(respondToOffer(token, { accept: true, signedName: "  " }))).toBe("VALIDATION");
    await respondToOffer(token, { accept: true, signedName: "  Meena Iyer " });

    const offer = await db.offer.findFirstOrThrow({ where: { applicationId: appId } });
    expect(offer.status).toBe("ACCEPTED");
    expect(offer.signedName).toBe("Meena Iyer");
    expect(offer.respondedAt).not.toBeNull();
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(await stage(appId)).toBe("OFFER"); // a person marks them hired
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: "OFFER_RESPONDED" } });
    expect(ev.actorName).toBe("Candidate");
    expect(ev.actorId).toBeNull();
    expect(JSON.stringify(ev)).not.toContain("21357");
  });

  it("decline with reason", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    await respondToOffer(await offerToken(), { accept: false, reason: " Found a job closer to home " });
    const offer = await db.offer.findFirstOrThrow({ where: { applicationId: appId } });
    expect(offer.status).toBe("DECLINED");
    expect(offer.declineReason).toBe("Found a job closer to home");
    const [view] = await getOffersForApp(admin, appId);
    expect(view.status).toBe("DECLINED");
  });

  it("answered and expired links don't change anything", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    const token = await offerToken();
    await respondToOffer(token, { accept: false });
    expect(await code(respondToOffer(token, { accept: true, signedName: "Meena" }))).toBe("CONFLICT");
    expect((await getOfferPage(token)).state).toBe("answered");
    expect((await db.offer.findFirstOrThrow({ where: { applicationId: appId } })).status).toBe("DECLINED");

    const second = await atInterview();
    await createOffer(admin, second, input());
    const t2 = await offerToken();
    // Past the reply date: the offer still exists, the link has expired.
    await db.offer.updateMany({ where: { applicationId: second }, data: { respondBy: new Date(Date.now() - 2 * DAY) } });
    await db.candidateLink.updateMany({ where: { applicationId: second, purpose: "OFFER" }, data: { expiresAt: new Date(Date.now() - DAY) } });
    expect((await getOfferPage(t2)).state).toBe("expired");
    expect(await code(respondToOffer(t2, { accept: true, signedName: "Meena" }))).toBe("CONFLICT");
    expect((await db.offer.findFirstOrThrow({ where: { applicationId: second } })).status).toBe("SENT");

    expect((await getOfferPage("nope")).state).toBe("invalid");
  });

  it("a rejected candidate's offer link says the position is closed", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    const token = await offerToken();
    await changeStage(admin, appId, "REJECTED", { code: "Position filled" });
    expect((await getOfferPage(token)).state).toBe("closed");
    expect(await code(respondToOffer(token, { accept: true, signedName: "Meena" }))).toBe("CONFLICT");
  });

  it("review #4: a rejected candidate's accepted-offer link says the position is closed", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    const token = await offerToken();
    await respondToOffer(token, { accept: true, signedName: "Meena Iyer" });
    await changeStage(admin, appId, "REJECTED", { code: "Other" });
    expect((await getOfferPage(token)).state).toBe("closed");
  });

  it("review #5: a lapsed offer no longer blocks a new one and reads as expired", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    await db.offer.updateMany({ where: { applicationId: appId }, data: { respondBy: new Date(Date.now() - 3 * DAY) } });
    await db.candidateLink.updateMany({ where: { applicationId: appId, purpose: "OFFER" }, data: { expiresAt: new Date(Date.now() - 2 * DAY) } });
    const [lapsed] = await getOffersForApp(admin, appId);
    expect(lapsed.expired).toBe(true);
    await createOffer(admin, appId, input({ monthlyPay: 23000 }));
    const offers = await getOffersForApp(admin, appId);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ monthlyPay: 23000, expired: false });
  });

  it("small: createOffer re-checks the stage inside its transaction", async () => {
    const appId = await atInterview();
    const stale = await db.application.findFirstOrThrow({ where: { id: appId }, include: { candidate: true, job: { include: { org: true } } } });
    await changeStage(admin, appId, "REJECTED", { code: "Other" });
    const spy = vi.spyOn(db.application, "findFirst").mockResolvedValueOnce(stale as never);
    try {
      expect(await code(createOffer(admin, appId, input()))).toBe("VALIDATION");
    } finally {
      spy.mockRestore();
    }
    expect(await db.offer.count()).toBe(0);
    expect(await stage(appId)).toBe("REJECTED");
  });

  it("withdraw needs a reason, emails, then a new offer is allowed", async () => {
    const appId = await atInterview();
    const offerId = await createOffer(admin, appId, input());
    expect(await code(withdrawOffer(admin, offerId, "  "))).toBe("VALIDATION");
    await withdrawOffer(admin, offerId, "Budget was cut for Meena");
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).status).toBe("WITHDRAWN");
    expect(await db.message.count({ where: { kind: "CANDIDATE_OFFER_WITHDRAWN" } })).toBe(1);
    const token = await offerToken();
    expect((await getOfferPage(token)).state).toBe("answered");
    expect(await code(withdrawOffer(admin, offerId, "again"))).toBe("CONFLICT");

    await createOffer(admin, appId, input({ monthlyPay: 19000 }));
    expect(await stage(appId)).toBe("OFFER");
    expect(await db.offer.count({ where: { applicationId: appId, status: "SENT" } })).toBe(1);
  });

  it("markHired only after acceptance", async () => {
    const appId = await atInterview();
    expect(await code(markHired(admin, appId))).toBe("VALIDATION");
    await createOffer(admin, appId, input());
    expect(await code(markHired(admin, appId))).toBe("VALIDATION");
    await respondToOffer(await offerToken(), { accept: true, signedName: "Meena Iyer" });
    const interviewer = await addMember(admin, "INTERVIEWER");
    expect(await code(markHired(interviewer, appId))).toBe("FORBIDDEN");
    await markHired(admin, appId);
    expect(await stage(appId)).toBe("HIRED");
    expect(await code(markHired(admin, appId))).toBe("VALIDATION");
  });

  it("retention erases offers", async () => {
    const appId = await atInterview();
    await createOffer(admin, appId, input());
    const old = new Date(Date.now() - 400 * DAY);
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${old}, "createdAt" = ${old} WHERE "id" = ${appId}`;
    await db.candidate.updateMany({ data: { createdAt: old } });
    await purgeExpired();
    expect(await db.offer.count()).toBe(0);
    expect(await db.candidateLink.count()).toBe(0);
  });
});
