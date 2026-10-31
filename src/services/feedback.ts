import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCan, can, type Actor } from "@/lib/rbac";
import { RECOMMENDATIONS, type Recommendation } from "@/domain/constants";
import { audit } from "./audit";

export const FEEDBACK_NOTES_MAX = 2000;

export type FeedbackInput = { ratings: Record<string, number>; recommendation: Recommendation; notes: string };

export type FeedbackRating = { skillId: string; name: string; rating: number };

export type FeedbackView = {
  interviewId: string;
  interviewerId: string;
  interviewerName: string;
  startsAt: Date;
  recommendation: Recommendation;
  notes: string;
  ratings: FeedbackRating[];
};

/** Interviews that can take feedback: not cancelled or no-show. */
const OPEN_FOR_FEEDBACK = ["SCHEDULED", "COMPLETED"];

/**
 * The assigned interviewer records ratings for every current scorecard skill (0–4, the grader's scale),
 * a recommendation and optional notes. Final once submitted: it is evidence.
 */
export async function submitFeedback(actor: Actor, interviewId: string, input: FeedbackInput): Promise<void> {
  const iv = await db.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId: actor.orgId } } },
    include: {
      feedback: { select: { id: true } },
      application: { include: { job: { include: { scorecard: { include: { skills: { orderBy: { order: "asc" } } } } } } } },
    },
  });
  if (!iv) throw new AppError("NOT_FOUND", "Interview not found.");
  if (iv.interviewerId !== actor.id) throw new AppError("FORBIDDEN", "Only the interviewer can give feedback on this interview.");
  if (!OPEN_FOR_FEEDBACK.includes(iv.status)) throw new AppError("VALIDATION", "This interview didn't take place, so it takes no feedback.");
  if (iv.startsAt > new Date()) throw new AppError("VALIDATION", "You can give feedback once the interview has started.");
  if (iv.feedback) throw new AppError("CONFLICT", "You've already given feedback on this interview.");

  const skills = iv.application.job.scorecard?.skills ?? [];
  const fields: Record<string, string> = {};
  const ratings: FeedbackRating[] = [];
  for (const s of skills) {
    const r = input.ratings?.[s.id];
    if (typeof r !== "number" || !Number.isInteger(r) || r < 0 || r > 4) fields[`rating_${s.id}`] = "Choose a rating";
    else ratings.push({ skillId: s.id, name: s.name, rating: r });
  }
  if (!RECOMMENDATIONS.includes(input.recommendation)) fields.recommendation = "Choose a recommendation";
  const notes = (input.notes ?? "").trim();
  if (notes.length > FEEDBACK_NOTES_MAX) fields.notes = `Keep notes under ${FEEDBACK_NOTES_MAX} characters`;
  if (Object.keys(fields).length) throw new AppError("VALIDATION", "Please rate every skill and choose a recommendation.", fields);

  await db
    .$transaction(async (tx) => {
      await tx.feedback.create({
        data: { interviewId: iv.id, interviewerId: actor.id, ratings: JSON.stringify(ratings), recommendation: input.recommendation, notes },
      });
      if (iv.status === "SCHEDULED") await tx.interview.update({ where: { id: iv.id }, data: { status: "COMPLETED" } });
      await tx.application.update({ where: { id: iv.applicationId }, data: { updatedAt: new Date() } });
      await audit(tx, {
        orgId: actor.orgId,
        actorId: actor.id,
        actorName: actor.name,
        action: "FEEDBACK_SUBMITTED",
        entityType: "Application",
        entityId: iv.applicationId,
        jobId: iv.application.jobId,
        after: { interviewId: iv.id, recommendation: input.recommendation },
      });
    })
    .catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError("CONFLICT", "You've already given feedback on this interview.");
      }
      throw e;
    });
}

/**
 * Feedback on an application, respecting independence: deciders see everything; an interviewer sees
 * others' feedback only once they have none of their own still due.
 */
export async function getFeedback(
  actor: Actor,
  appId: string,
  now = new Date(),
): Promise<{ visible: FeedbackView[]; hiddenCount: number; mineDue: string[]; skills: { id: string; name: string }[] }> {
  assertCan(actor, "interview.view");
  const app = await db.application.findFirst({
    where: { id: appId, job: { orgId: actor.orgId } },
    select: { id: true, job: { select: { scorecard: { select: { skills: { orderBy: { order: "asc" }, select: { id: true, name: true } } } } } } },
  });
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");

  const interviews = await db.interview.findMany({
    where: { applicationId: appId },
    orderBy: { startsAt: "asc" },
    include: { feedback: true },
  });
  const mineDue = interviews
    .filter((i) => i.interviewerId === actor.id && !i.feedback && OPEN_FOR_FEEDBACK.includes(i.status) && i.startsAt <= now)
    .map((i) => i.id);
  const given = interviews.filter((i) => i.feedback);
  const submittedMine = given.some((i) => i.interviewerId === actor.id);
  const seesAll = can(actor.role, "interview.manage") || (submittedMine && mineDue.length === 0);
  const shown = seesAll ? given : given.filter((i) => i.interviewerId === actor.id);

  const users = await db.user.findMany({ where: { id: { in: shown.map((i) => i.interviewerId) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    visible: shown.map((i) => ({
      interviewId: i.id,
      interviewerId: i.interviewerId,
      interviewerName: names.get(i.interviewerId) ?? "Former team member",
      startsAt: i.startsAt,
      recommendation: i.feedback!.recommendation as Recommendation,
      notes: i.feedback!.notes,
      ratings: JSON.parse(i.feedback!.ratings) as FeedbackRating[],
    })),
    hiddenCount: given.length - shown.length,
    mineDue,
    skills: app.job.scorecard?.skills ?? [],
  };
}
