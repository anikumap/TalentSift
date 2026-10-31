import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { assertCan, can, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import type { OfferStatus } from "@/domain/constants";
import { istDate, istToUtc } from "@/domain/interviews";
import { DECLINE_REASON_MAX, OFFER_TERMS_MAX, offerLinkExpiry, validateOfferInput } from "@/domain/offers";
import { audit } from "./audit";
import { findLink, issueLink, linkUrl } from "./candidateLinks";
import { applyStageChange } from "./decisions";
import { offerEmail, offerWithdrawnEmail } from "./emails";

export type OfferLetter = {
  orgName: string;
  candidateName: string;
  jobTitle: string;
  location: string;
  shifts: string;
  monthlyPay: number;
  startDate: Date;
  respondBy: Date;
  terms: string;
  status: OfferStatus;
  signedName: string | null;
};

export type OfferPage = { state: "invalid" } | { state: "expired" | "answered" | "open" | "closed"; letter: OfferLetter };

export type OfferView = {
  id: string;
  monthlyPay: number;
  startDate: Date;
  respondBy: Date;
  terms: string;
  status: OfferStatus;
  signedName: string | null;
  declineReason: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  /** Sent, but the reply date has passed with no answer. */
  expired: boolean;
};

const DAY = 86_400_000;
/** `respondBy` is stored as the start of that India day; the offer stands until the end of it. */
const lapsed = (o: { status: string; respondBy: Date }, now = new Date()) => o.status === "SENT" && o.respondBy.getTime() + DAY <= now.getTime();
/** Offers that block a new one: accepted, or sent and still within the reply date. */
const liveWhere = (applicationId: string, now = new Date()) => ({
  applicationId,
  OR: [{ status: "ACCEPTED" }, { status: "SENT", respondBy: { gt: new Date(now.getTime() - DAY) } }],
});
const OFFERABLE_STAGES = ["INTERVIEW", "OFFER"];

const loadApp = (actor: Actor, appId: string) =>
  db.application.findFirst({ where: { id: appId, job: { orgId: actor.orgId } }, include: { candidate: true, job: { include: { org: true } } } });

const touch = (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], appId: string) =>
  tx.application.update({ where: { id: appId }, data: { updatedAt: new Date() } });

/** Sends an offer: moves the application to Offer if needed, records the offer and its link, all in one transaction. */
export async function createOffer(
  actor: Actor,
  appId: string,
  input: { monthlyPay: number; startDate: string; respondBy: string; terms: string },
): Promise<string> {
  assertCan(actor, "interview.manage");
  const app = await loadApp(actor, appId);
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (!OFFERABLE_STAGES.includes(app.stage)) throw new AppError("VALIDATION", "Interview the candidate before making an offer.");
  const fields = validateOfferInput(input, new Date());
  const terms = (input.terms ?? "").trim();
  if (terms.length > OFFER_TERMS_MAX) fields.terms = `Keep the terms under ${OFFER_TERMS_MAX} characters`;
  if (Object.keys(fields).length) throw new AppError("VALIDATION", "Please check the offer details.", fields);

  const { offerId, token } = await db.$transaction(async (tx) => {
    // Re-read inside the transaction: the application may have been rejected since it was loaded.
    const fresh = await tx.application.findUniqueOrThrow({ where: { id: app.id }, select: { id: true, jobId: true, stage: true, revealed: true } });
    if (!OFFERABLE_STAGES.includes(fresh.stage)) throw new AppError("VALIDATION", "Interview the candidate before making an offer.");
    const live = await tx.offer.count({ where: liveWhere(app.id) });
    if (live) throw new AppError("CONFLICT", "There's already an open offer. Withdraw it before sending a new one.");
    if (fresh.stage !== "OFFER") await applyStageChange(tx, actor, fresh, "OFFER", null);
    const offer = await tx.offer.create({
      data: {
        applicationId: app.id,
        monthlyPay: input.monthlyPay,
        startDate: istToUtc(input.startDate, "00:00"),
        respondBy: istToUtc(input.respondBy, "00:00"),
        terms,
        createdById: actor.id,
      },
    });
    const token = await issueLink(tx, app.id, "OFFER", offerLinkExpiry(input.respondBy));
    await touch(tx, app.id);
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "OFFER_SENT",
      entityType: "Application",
      entityId: app.id,
      jobId: app.jobId,
      after: { offerId: offer.id, status: "SENT" },
    });
    return { offerId: offer.id, token };
  });

  await getProviders().email.send({
    orgId: actor.orgId,
    to: decrypt(app.candidate.emailEnc),
    kind: "CANDIDATE_OFFER",
    ...offerEmail(decrypt(app.candidate.nameEnc), app.job.title, app.job.org.name, linkUrl("offer", token), istDate(istToUtc(input.respondBy, "00:00"))),
  });
  return offerId;
}

export async function withdrawOffer(actor: Actor, offerId: string, reason: string): Promise<void> {
  assertCan(actor, "interview.manage");
  const offer = await db.offer.findFirst({
    where: { id: offerId, application: { job: { orgId: actor.orgId } } },
    include: { application: { include: { candidate: true, job: { include: { org: true } } } } },
  });
  if (!offer) throw new AppError("NOT_FOUND", "Offer not found.");
  const why = (reason ?? "").trim().slice(0, DECLINE_REASON_MAX);
  if (!why) throw new AppError("VALIDATION", "Say why the offer is being withdrawn.", { reason: "Required" });
  await db.$transaction(async (tx) => {
    const { count } = await tx.offer.updateMany({ where: { id: offer.id, status: "SENT" }, data: { status: "WITHDRAWN" } });
    if (!count) throw new AppError("CONFLICT", "Only an offer that's waiting for a reply can be withdrawn.");
    await touch(tx, offer.applicationId);
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "OFFER_WITHDRAWN",
      entityType: "Application",
      entityId: offer.applicationId,
      jobId: offer.application.jobId,
      reason: why,
      after: { offerId: offer.id, status: "WITHDRAWN" },
    });
  });
  const app = offer.application;
  await getProviders().email.send({
    orgId: actor.orgId,
    to: decrypt(app.candidate.emailEnc),
    kind: "CANDIDATE_OFFER_WITHDRAWN",
    ...offerWithdrawnEmail(decrypt(app.candidate.nameEnc), app.job.title, app.job.org.name),
  });
}

async function resolveOffer(token: string) {
  const link = await findLink(token, "OFFER");
  if (!link) return null;
  const app = await db.application.findUnique({
    where: { id: link.applicationId },
    include: { candidate: true, job: { include: { org: true } }, offers: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const offer = app?.offers[0];
  if (!app || !offer) return null;
  const letter: OfferLetter = {
    orgName: app.job.org.name,
    candidateName: decrypt(app.candidate.nameEnc),
    jobTitle: app.job.title,
    location: app.job.location,
    shifts: app.job.shifts,
    monthlyPay: offer.monthlyPay,
    startDate: offer.startDate,
    respondBy: offer.respondBy,
    terms: offer.terms,
    status: offer.status as OfferStatus,
    signedName: offer.signedName,
  };
  const state: Exclude<OfferPage["state"], "invalid"> =
    app.stage === "REJECTED"
      ? "closed"
      : offer.status !== "SENT"
        ? "answered"
        : !OFFERABLE_STAGES.includes(app.stage)
          ? "closed"
          : link.expired || lapsed(offer)
            ? "expired"
            : "open";
  return { app, offer, letter, state };
}

export async function getOfferPage(token: string): Promise<OfferPage> {
  const r = await resolveOffer(token);
  return r ? { state: r.state, letter: r.letter } : { state: "invalid" };
}

const REFUSED: Record<string, string> = {
  answered: "This offer has already been answered.",
  expired: "This offer has expired. Please reply to the employer's email.",
  closed: "This position is no longer open.",
};

/** The candidate's answer. Final: a second answer, or one after the reply date, changes nothing. */
export async function respondToOffer(token: string, r: { accept: true; signedName: string } | { accept: false; reason?: string }): Promise<void> {
  const found = await resolveOffer(token);
  if (!found) throw new AppError("NOT_FOUND", "This link isn't valid. Please reply to the employer's email.");
  if (found.state !== "open") throw new AppError("CONFLICT", REFUSED[found.state]);
  const signedName = r.accept ? r.signedName.trim().slice(0, 120) : null;
  if (r.accept && (!signedName || signedName.length < 2)) {
    throw new AppError("VALIDATION", "Type your full name to accept.", { signedName: "Type your full name" });
  }
  const declineReason = !r.accept ? r.reason?.trim().slice(0, DECLINE_REASON_MAX) || null : null;
  const status: OfferStatus = r.accept ? "ACCEPTED" : "DECLINED";
  await db.$transaction(async (tx) => {
    const { count } = await tx.offer.updateMany({
      where: { id: found.offer.id, status: "SENT" },
      data: { status, signedName, declineReason, respondedAt: new Date() },
    });
    if (!count) throw new AppError("CONFLICT", REFUSED.answered);
    await touch(tx, found.app.id);
    await audit(tx, {
      orgId: found.app.job.orgId,
      actorName: "Candidate",
      action: "OFFER_RESPONDED",
      entityType: "Application",
      entityId: found.app.id,
      jobId: found.app.jobId,
      after: { offerId: found.offer.id, status },
    });
  });
}

/** Offers for the candidate page, newest first. Pay is for deciders only; interviewers get none. */
export async function getOffersForApp(actor: Actor, appId: string): Promise<OfferView[]> {
  assertCan(actor, "interview.view");
  if (!can(actor.role, "interview.manage")) return [];
  const offers = await db.offer.findMany({ where: { applicationId: appId, application: { job: { orgId: actor.orgId } } }, orderBy: { createdAt: "desc" } });
  return offers.map((o) => ({
    id: o.id,
    monthlyPay: o.monthlyPay,
    startDate: o.startDate,
    respondBy: o.respondBy,
    terms: o.terms,
    status: o.status as OfferStatus,
    signedName: o.signedName,
    declineReason: o.declineReason,
    respondedAt: o.respondedAt,
    createdAt: o.createdAt,
    expired: lapsed(o),
  }));
}

/** After the candidate accepts, a person confirms the hire. */
export async function markHired(actor: Actor, appId: string): Promise<void> {
  assertCan(actor, "interview.manage");
  const app = await loadApp(actor, appId);
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  await db.$transaction(async (tx) => {
    const accepted = await tx.offer.count({ where: { applicationId: app.id, status: "ACCEPTED" } });
    if (app.stage !== "OFFER" || !accepted) throw new AppError("VALIDATION", "Mark someone hired once they've accepted an offer.");
    await applyStageChange(tx, actor, app, "HIRED", null);
  });
}
