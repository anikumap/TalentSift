import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import { parse } from "@/lib/validation";
import { canPublish } from "@/domain/billing";
import { MUST_HAVE_KINDS, type JobStatus, type MustHaveKind, type Plan } from "@/domain/constants";
import { normalizeWeights } from "@/domain/scoring";
import { checkWording } from "@/domain/wording";
import type { IntakeAnswers, ScorecardDraft } from "@/providers/types";
import { audit } from "./audit";

const intakeSchema = z
  .object({
    title: z.string().trim().min(2, "Enter the job title").max(100),
    location: z.string().trim().min(2, "Enter the location").max(100),
    tasks: z.string().trim().max(1000).default(""),
    mustHaves: z.string().trim().max(1000).default(""),
    payMin: z.coerce.number().int().min(0, "Pay can't be negative").max(10_000_000),
    payMax: z.coerce.number().int().min(0).max(10_000_000),
    shifts: z.string().trim().min(1, "Describe the shifts").max(200),
  })
  .refine((v) => v.payMax >= v.payMin, { message: "Maximum pay must be at least the minimum", path: ["payMax"] });

const skillSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Skill name is required").max(80),
  description: z.string().trim().max(300).default(""),
  weight: z.coerce.number().min(0).max(1000),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});

const mustHaveSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Must-have label is required").max(120),
  kind: z.enum(MUST_HAVE_KINDS).default("OTHER"),
  question: z.string().trim().min(1, "Must-have question is required").max(300),
});

const scorecardSchema = z.object({
  skills: z.array(skillSchema).min(3, "A scorecard needs at least 3 skills").max(6, "A scorecard can have at most 6 skills"),
  mustHaves: z.array(mustHaveSchema).max(8, "Keep must-haves to 8 or fewer"),
});

const detailsSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  adText: z.string().max(10_000).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  shifts: z.string().trim().min(1).max(200).optional(),
  payMin: z.coerce.number().int().min(0).optional(),
  payMax: z.coerce.number().int().min(0).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        prompt: z.string().trim().min(5, "Question is too short").max(500),
        skillIds: z.array(z.string()).min(1, "Link each question to at least one skill"),
      }),
    )
    .min(1, "Keep at least one question")
    .max(5, "Use at most 5 questions")
    .optional(),
});

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "job"}-${randomBytes(3).toString("hex")}`;
}

const json = <T>(s: string): T => JSON.parse(s) as T;

async function findOwnJob(actor: Actor, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, orgId: actor.orgId } });
  if (!job) throw new AppError("NOT_FOUND", "Job not found.");
  return job;
}

export async function previewScorecard(answers: Partial<IntakeAnswers>): Promise<ScorecardDraft> {
  return getProviders().ai.generateScorecard({
    title: answers.title ?? "",
    location: answers.location ?? "",
    tasks: answers.tasks ?? "",
    mustHaves: answers.mustHaves ?? "",
    payMin: answers.payMin ?? 0,
    payMax: answers.payMax ?? 0,
    shifts: answers.shifts ?? "",
  });
}

export async function createJobFromIntake(actor: Actor, answers: IntakeAnswers): Promise<string> {
  assertCan(actor, "job.edit");
  const intake = parse(intakeSchema, answers);
  const { ai } = getProviders();
  const card = await ai.generateScorecard(intake);
  const weights = normalizeWeights(card.skills.map((s) => s.weight));
  const adText = await ai.generateJobAd(intake, card);

  return db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        orgId: actor.orgId,
        title: intake.title,
        roleFamily: card.roleFamily,
        location: intake.location,
        payMin: intake.payMin,
        payMax: intake.payMax,
        shifts: intake.shifts,
        slug: slugify(intake.title),
        adText,
        scorecard: {
          create: {
            mustHaves: { create: card.mustHaves.map((m, order) => ({ ...m, order })) },
          },
        },
      },
      include: { scorecard: true },
    });
    const skillIdByName = new Map<string, string>();
    for (const [order, s] of card.skills.entries()) {
      const skill = await tx.skill.create({
        data: {
          scorecardId: job.scorecard!.id,
          name: s.name,
          description: s.description,
          weight: weights[order],
          keywords: JSON.stringify(s.keywords),
          order,
        },
      });
      skillIdByName.set(s.name, skill.id);
    }
    await tx.workSampleQuestion.createMany({
      data: card.questions.map((q, order) => ({
        jobId: job.id,
        prompt: q.prompt,
        skillIds: JSON.stringify(q.skillNames.map((n) => skillIdByName.get(n)).filter(Boolean)),
        order,
      })),
    });
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "SCORECARD_UPDATED",
      entityType: "Job",
      entityId: job.id,
      jobId: job.id,
      reason: "Created from intake",
      after: { skills: card.skills.map((s, i) => ({ name: s.name, weight: weights[i] })) },
    });
    return job.id;
  });
}

export type JobDetail = Awaited<ReturnType<typeof getJob>>;

export async function getJob(actor: Actor, jobId: string) {
  assertCan(actor, "candidate.view");
  const job = await db.job.findFirst({
    where: { id: jobId, orgId: actor.orgId },
    include: {
      scorecard: {
        include: { skills: { orderBy: { order: "asc" } }, mustHaves: { orderBy: { order: "asc" } } },
      },
      questions: { orderBy: { order: "asc" } },
      _count: { select: { applications: true } },
    },
  });
  if (!job || !job.scorecard) throw new AppError("NOT_FOUND", "Job not found.");
  const skills = job.scorecard.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    weight: s.weight,
    keywords: json<string[]>(s.keywords),
  }));
  return {
    id: job.id,
    title: job.title,
    roleFamily: job.roleFamily,
    location: job.location,
    payMin: job.payMin,
    payMax: job.payMax,
    shifts: job.shifts,
    status: job.status as JobStatus,
    slug: job.slug,
    adText: job.adText,
    openedAt: job.openedAt,
    applicants: job._count.applications,
    skills,
    mustHaves: job.scorecard.mustHaves.map((m) => ({
      id: m.id,
      label: m.label,
      kind: m.kind as MustHaveKind,
      question: m.question,
    })),
    questions: job.questions.map((q) => ({ id: q.id, prompt: q.prompt, skillIds: json<string[]>(q.skillIds) })),
    // Hourly hiring is the launch niche, so every job is checked as an hourly role.
    wordingFlags: checkWording(job.adText, { skillNames: skills.map((s) => s.name), hourly: true }),
  };
}

export async function updateScorecard(
  actor: Actor,
  jobId: string,
  input: z.input<typeof scorecardSchema>,
): Promise<void> {
  assertCan(actor, "job.edit");
  const data = parse(scorecardSchema, input);
  const before = await getJob(actor, jobId);
  const scorecard = await db.scorecard.findUniqueOrThrow({ where: { jobId } });
  const weights = normalizeWeights(data.skills.map((s) => s.weight));

  await db.$transaction(async (tx) => {
    const keptSkillIds = new Set<string>();
    for (const [order, s] of data.skills.entries()) {
      const fields = {
        name: s.name,
        description: s.description,
        weight: weights[order],
        keywords: JSON.stringify(s.keywords),
        order,
      };
      const existing = s.id && before.skills.some((b) => b.id === s.id);
      const saved = existing
        ? await tx.skill.update({ where: { id: s.id }, data: fields })
        : await tx.skill.create({ data: { ...fields, scorecardId: scorecard.id } });
      keptSkillIds.add(saved.id);
    }
    const removed = before.skills.filter((s) => !keptSkillIds.has(s.id)).map((s) => s.id);
    if (removed.length) {
      await tx.skill.deleteMany({ where: { id: { in: removed } } });
      for (const q of before.questions) {
        const remaining = q.skillIds.filter((id) => !removed.includes(id));
        if (remaining.length !== q.skillIds.length) {
          await tx.workSampleQuestion.update({
            where: { id: q.id },
            data: { skillIds: JSON.stringify(remaining.length ? remaining : [...keptSkillIds].slice(0, 1)) },
          });
        }
      }
    }

    const keptMustHaves = new Set<string>();
    for (const [order, m] of data.mustHaves.entries()) {
      const fields = { label: m.label, kind: m.kind, question: m.question, order };
      const existing = m.id && before.mustHaves.some((b) => b.id === m.id);
      const saved = existing
        ? await tx.mustHave.update({ where: { id: m.id }, data: fields })
        : await tx.mustHave.create({ data: { ...fields, scorecardId: scorecard.id } });
      keptMustHaves.add(saved.id);
    }
    await tx.mustHave.deleteMany({ where: { scorecardId: scorecard.id, id: { notIn: [...keptMustHaves] } } });

    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "SCORECARD_UPDATED",
      entityType: "Job",
      entityId: jobId,
      jobId,
      before: { skills: before.skills.map(({ name, weight }) => ({ name, weight })), mustHaves: before.mustHaves.map((m) => m.label) },
      after: { skills: data.skills.map((s, i) => ({ name: s.name, weight: weights[i] })), mustHaves: data.mustHaves.map((m) => m.label) },
    });
  });
}

export async function updateJobDetails(
  actor: Actor,
  jobId: string,
  input: z.input<typeof detailsSchema>,
): Promise<void> {
  assertCan(actor, "job.edit");
  const data = parse(detailsSchema, input);
  const job = await findOwnJob(actor, jobId);
  const payMin = data.payMin ?? job.payMin;
  const payMax = data.payMax ?? job.payMax;
  if (payMax < payMin) throw new AppError("VALIDATION", "Maximum pay must be at least the minimum", { payMax: "Too low" });

  const { questions, ...fields } = data;
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: fields as Prisma.JobUpdateInput });
    if (questions) {
      const validSkills = new Set(
        (await tx.skill.findMany({ where: { scorecard: { jobId } }, select: { id: true } })).map((s) => s.id),
      );
      await tx.workSampleQuestion.deleteMany({ where: { jobId, id: { notIn: questions.flatMap((q) => (q.id ? [q.id] : [])) } } });
      for (const [order, q] of questions.entries()) {
        const skillIds = JSON.stringify(q.skillIds.filter((id) => validSkills.has(id)));
        if (q.id) {
          await tx.workSampleQuestion.updateMany({ where: { id: q.id, jobId }, data: { prompt: q.prompt, skillIds, order } });
        } else {
          await tx.workSampleQuestion.create({ data: { jobId, prompt: q.prompt, skillIds, order } });
        }
      }
    }
  });
}

export async function regenerateAd(actor: Actor, jobId: string): Promise<void> {
  assertCan(actor, "job.edit");
  const job = await getJob(actor, jobId);
  const adText = await getProviders().ai.generateJobAd(job, job);
  await db.job.update({ where: { id: jobId }, data: { adText } });
}

export async function publishJob(actor: Actor, jobId: string): Promise<void> {
  assertCan(actor, "job.publish");
  const job = await findOwnJob(actor, jobId);
  if (job.status === "OPEN") return;
  const now = new Date();

  await db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { orgId: actor.orgId } });
    const openJobs = await tx.job.count({ where: { orgId: actor.orgId, status: "OPEN" } });
    // Credits already tied to a job that is still open are in use; unused credits add a slot.
    const credits = await tx.jobCredit.findMany({
      where: { orgId: actor.orgId, expiresAt: { gt: now } },
      include: { job: { select: { status: true } } },
    });
    const free = credits.filter((c) => !c.jobId || c.job?.status !== "OPEN");
    const inUse = credits.length - free.length;
    const state = { plan: sub.plan as Plan, status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd };

    const check = canPublish(state, openJobs - inUse, 0, now);
    if (!check.ok) {
      if (free.length === 0) throw new AppError("LIMIT", check.reason);
      await tx.jobCredit.update({ where: { id: free[0].id }, data: { jobId } });
    }

    await tx.job.update({ where: { id: jobId }, data: { status: "OPEN", openedAt: job.openedAt ?? now } });
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "JOB_PUBLISHED",
      entityType: "Job",
      entityId: jobId,
      jobId,
      before: { status: job.status },
      after: { status: "OPEN", usedCredit: !check.ok },
    });
  });
}

export async function closeJob(actor: Actor, jobId: string): Promise<void> {
  assertCan(actor, "job.publish");
  const job = await findOwnJob(actor, jobId);
  if (job.status !== "OPEN") return;
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: "CLOSED" } });
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "JOB_CLOSED",
      entityType: "Job",
      entityId: jobId,
      jobId,
      before: { status: "OPEN" },
      after: { status: "CLOSED" },
    });
  });
}

export async function listJobs(actor: Actor) {
  assertCan(actor, "candidate.view");
  const jobs = await db.job.findMany({
    where: { orgId: actor.orgId },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { applications: true } } },
  });
  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    location: j.location,
    status: j.status as JobStatus,
    slug: j.slug,
    applicants: j._count.applications,
    createdAt: j.createdAt,
  }));
}

/** Public: used by the apply page. Returns null unless the job is open. */
export async function getOpenJobBySlug(slug: string) {
  const job = await db.job.findFirst({
    where: { slug, status: "OPEN" },
    include: {
      org: { select: { name: true } },
      scorecard: { include: { mustHaves: { orderBy: { order: "asc" } } } },
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    orgName: job.org.name,
    location: job.location,
    payMin: job.payMin,
    payMax: job.payMax,
    shifts: job.shifts,
    adText: job.adText,
    mustHaves: (job.scorecard?.mustHaves ?? []).map((m) => ({ id: m.id, question: m.question, label: m.label })),
    questions: job.questions.map((q) => ({ id: q.id, prompt: q.prompt })),
  };
}
