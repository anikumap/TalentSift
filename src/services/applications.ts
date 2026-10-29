import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt, hashEmail } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import { parse } from "@/lib/validation";
import { STAGES, type Stage } from "@/domain/constants";
import { detectInjection } from "@/domain/injection";
import { redactText } from "@/domain/redact";
import { computeTotal, resumeSignal, type ParsedResume } from "@/domain/scoring";
import { audit } from "./audit";
import { extractResumeText, RESUME_MAX_BYTES, RESUME_TYPES, resumeExtension } from "./resume";

export const ANSWER_MAX = 1000;

const applicationSchema = z.object({
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree to how we use your information" }) }),
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s\-()]{7,19}$/, "Enter a valid phone number"),
  city: z.string().trim().min(2, "Enter your city").max(80),
  mustHaveAnswers: z.record(z.boolean()).default({}),
  answers: z.record(z.string().max(ANSWER_MAX, `Keep each answer under ${ANSWER_MAX} characters`)).default({}),
  resume: z
    .object({ filename: z.string().max(200), bytes: z.instanceof(Buffer) })
    .refine((r) => RESUME_TYPES.includes(resumeExtension(r.filename)), "Resume must be a PDF or .txt file")
    .refine((r) => r.bytes.length <= RESUME_MAX_BYTES, "Resume must be 5 MB or smaller")
    .optional(),
});

export type ApplicationInput = z.input<typeof applicationSchema>;

const json = <T>(s: string | null, fallback: T): T => (s ? (JSON.parse(s) as T) : fallback);

/** Public, no actor. Saves first, then evaluates, so a provider failure never loses a submission. */
export async function submitApplication(slug: string, input: ApplicationInput): Promise<{ publicRef: string }> {
  const data = parse(applicationSchema, input);
  const job = await db.job.findFirst({
    where: { slug, status: "OPEN" },
    include: { questions: true, scorecard: { include: { mustHaves: true } } },
  });
  if (!job) throw new AppError("NOT_FOUND", "This job is no longer accepting applications.");

  const emailHash = hashEmail(data.email);
  const existing = await db.application.findFirst({ where: { jobId: job.id, candidate: { emailHash } } });
  if (existing) throw new AppError("CONFLICT", "You've already applied for this job. We'll be in touch soon.");

  const questionIds = new Set(job.questions.map((q) => q.id));
  const mustHaveIds = new Set(job.scorecard?.mustHaves.map((m) => m.id) ?? []);
  const answers = Object.fromEntries(Object.entries(data.answers).filter(([id]) => questionIds.has(id)));
  const mustHaveAnswers = Object.fromEntries(Object.entries(data.mustHaveAnswers).filter(([id]) => mustHaveIds.has(id)));

  const resumeText = data.resume ? await extractResumeText(data.resume) : null;
  let resumeParsed: ParsedResume | null = null;
  if (resumeText) {
    try {
      resumeParsed = await getProviders().ai.parseResume(resumeText);
    } catch {
      resumeParsed = null;
    }
  }

  const app = await db.$transaction(async (tx) => {
    const taken = new Set((await tx.application.findMany({ where: { jobId: job.id }, select: { publicRef: true } })).map((a) => a.publicRef));
    let publicRef = "";
    do publicRef = randomBytes(2).toString("hex").toUpperCase();
    while (taken.has(publicRef));

    const candidate = await tx.candidate.create({
      data: {
        orgId: job.orgId,
        nameEnc: encrypt(data.name),
        emailEnc: encrypt(data.email),
        phoneEnc: encrypt(data.phone),
        addressEnc: encrypt(data.city),
        emailHash,
      },
    });
    const created = await tx.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        publicRef,
        consentAt: new Date(),
        answers: JSON.stringify(answers),
        mustHaveAnswers: JSON.stringify(mustHaveAnswers),
        resumeText,
        resumeParsed: resumeParsed ? JSON.stringify(resumeParsed) : null,
      },
    });
    await audit(tx, {
      orgId: job.orgId,
      action: "APPLICATION_SUBMITTED",
      entityType: "Application",
      entityId: created.id,
      jobId: job.id,
      after: { publicRef },
    });
    return created;
  });

  await evaluateApplication(app.id);
  return { publicRef: app.publicRef };
}

/** Grades answers against the scorecard. Sets FAILED instead of throwing. */
export async function evaluateApplication(appId: string): Promise<void> {
  const app = await db.application.findUniqueOrThrow({
    where: { id: appId },
    include: {
      job: {
        include: { questions: { orderBy: { order: "asc" } }, scorecard: { include: { skills: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  const skills = app.job.scorecard?.skills ?? [];
  const answers = json<Record<string, string>>(app.answers, {});
  const { ai } = getProviders();

  try {
    const nameById = new Map(skills.map((s) => [s.id, s.name]));
    const grades = await ai.gradeAnswers({
      skills: skills.map((s) => ({ name: s.name, keywords: json<string[]>(s.keywords, []) })),
      questions: app.job.questions.map((q) => ({
        prompt: q.prompt,
        skillNames: json<string[]>(q.skillIds, []).map((id) => nameById.get(id)).filter((n): n is string => !!n),
      })),
      answers: app.job.questions.map((q) => answers[q.id] ?? ""),
    });
    const bySkillName = new Map(grades.map((g) => [g.skillName, g]));
    const parsed = json<ParsedResume | null>(app.resumeParsed, null);
    const keywords = skills.flatMap((s) => json<string[]>(s.keywords, []));
    const signal = parsed ? resumeSignal(parsed, keywords) : null;
    const rows = skills.map((s) => {
      const g = bySkillName.get(s.name);
      return { skillId: s.id, score: Math.max(0, Math.min(4, g?.score ?? 0)), evidence: g?.evidence ?? [] };
    });
    const totalScore = computeTotal(skills, rows, signal);

    await db.$transaction(async (tx) => {
      await tx.evaluation.deleteMany({ where: { applicationId: appId } });
      await tx.evaluation.createMany({
        data: rows.map((r) => ({
          applicationId: appId,
          skillId: r.skillId,
          score: r.score,
          evidence: JSON.stringify(r.evidence),
          model: ai.model,
          promptVersion: ai.promptVersion,
        })),
      });
      await tx.application.update({ where: { id: appId }, data: { totalScore, evalStatus: "DONE" } });
      await audit(tx, {
        orgId: app.job.orgId,
        action: "EVALUATION_CREATED",
        entityType: "Application",
        entityId: appId,
        jobId: app.jobId,
        after: { totalScore, model: ai.model, promptVersion: ai.promptVersion, scores: rows.map((r) => r.score) },
      });
    });
  } catch (err) {
    console.error(`Evaluation failed for application ${appId}:`, err);
    await db.application.update({ where: { id: appId }, data: { evalStatus: "FAILED" } });
  }
}

export async function retryEvaluation(actor: Actor, appId: string): Promise<void> {
  assertCan(actor, "candidate.view");
  const app = await db.application.findFirst({ where: { id: appId, job: { orgId: actor.orgId } } });
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  await evaluateApplication(appId);
}

export type ShortlistFilters = { mustHavesMet?: boolean; minScore?: number; stage?: Stage };

const appInclude = {
  candidate: true,
  evaluations: true,
  job: {
    include: {
      questions: { orderBy: { order: "asc" as const } },
      scorecard: {
        include: { skills: { orderBy: { order: "asc" as const } }, mustHaves: { orderBy: { order: "asc" as const } } },
      },
    },
  },
};

type AppWithRelations = NonNullable<Awaited<ReturnType<typeof loadApp>>>;

function loadApp(actor: Actor, appId: string) {
  return db.application.findFirst({ where: { id: appId, job: { orgId: actor.orgId } }, include: appInclude });
}

function toRow(app: AppWithRelations) {
  const name = decrypt(app.candidate.nameEnc);
  const show = (text: string) => (app.revealed ? text : redactText(text, [name]));
  const answers = json<Record<string, string>>(app.answers, {});
  const mustHaveAnswers = json<Record<string, boolean>>(app.mustHaveAnswers, {});
  const mustHaves = app.job.scorecard?.mustHaves ?? [];
  const missed = mustHaves.filter((m) => mustHaveAnswers[m.id] !== true);
  const evalBySkill = new Map(app.evaluations.map((e) => [e.skillId, e]));

  const skills = (app.job.scorecard?.skills ?? []).map((s) => {
    const e = evalBySkill.get(s.id);
    return {
      skillId: s.id,
      name: s.name,
      weight: s.weight,
      score: e?.score ?? 0,
      evidence: json<string[]>(e?.evidence ?? null, []).map(show),
    };
  });

  const graded = app.evalStatus === "DONE" && skills.length > 0;
  const ranked = [...skills].sort((a, b) => b.score * b.weight - a.score * a.weight);
  const strengths = ranked.filter((s) => s.score >= 2).slice(0, 2).map((s) => s.name);
  const weakest = [...skills].sort((a, b) => a.score - b.score || b.weight - a.weight)[0];
  const why = !graded
    ? app.evalStatus === "FAILED"
      ? "Evaluation failed. Retry to score this candidate."
      : "Evaluation pending."
    : [
        strengths.length ? `Strongest: ${strengths.join(" and ")}.` : "No strong skill evidence in the answers.",
        weakest && weakest.score < 3 ? `Least evidence: ${weakest.name} (${weakest.score}/4).` : "",
        missed.length ? `Missing ${missed.length} must-have${missed.length > 1 ? "s" : ""}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

  return {
    appId: app.id,
    jobId: app.jobId,
    jobTitle: app.job.title,
    publicRef: app.publicRef,
    displayName: app.revealed ? name : `Candidate #${app.publicRef}`,
    revealed: app.revealed,
    totalScore: app.totalScore,
    evalStatus: app.evalStatus as "PENDING" | "DONE" | "FAILED",
    stage: app.stage as Stage,
    createdAt: app.createdAt,
    skills,
    mustHavesMet: missed.length === 0,
    mustHavesMissed: missed.length,
    missedMustHaves: missed.map((m) => m.label),
    injectionFlags: detectInjection(Object.values(answers).join("\n") + "\n" + (app.resumeText ?? "")),
    why,
    _answers: answers,
    _name: name,
  };
}

export type ShortlistRow = Omit<ReturnType<typeof toRow>, "_answers" | "_name">;

function publicRow({ _answers, _name, ...row }: ReturnType<typeof toRow>): ShortlistRow {
  void _answers;
  void _name;
  return row;
}

export async function listShortlist(actor: Actor, jobId: string, filters: ShortlistFilters): Promise<ShortlistRow[]> {
  assertCan(actor, "candidate.view");
  const job = await db.job.findFirst({ where: { id: jobId, orgId: actor.orgId }, select: { id: true } });
  if (!job) throw new AppError("NOT_FOUND", "Job not found.");
  const stage = filters.stage && (STAGES as readonly string[]).includes(filters.stage) ? filters.stage : undefined;
  const apps = await db.application.findMany({
    where: { jobId, ...(stage ? { stage } : {}) },
    include: appInclude,
    orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
  });
  return apps
    .map((a) => publicRow(toRow(a)))
    .filter((r) => (filters.mustHavesMet ? r.mustHavesMet : true))
    .filter((r) => (filters.minScore !== undefined ? r.totalScore >= filters.minScore : true));
}

export async function listAllApplications(actor: Actor, filters: { stage?: Stage } = {}): Promise<ShortlistRow[]> {
  assertCan(actor, "candidate.view");
  const apps = await db.application.findMany({
    where: { job: { orgId: actor.orgId }, ...(filters.stage ? { stage: filters.stage } : {}) },
    include: appInclude,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return apps.map((a) => publicRow(toRow(a)));
}

export async function getApplicationDetail(actor: Actor, appId: string) {
  assertCan(actor, "candidate.view");
  const app = await loadApp(actor, appId);
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  const row = toRow(app);
  const show = (text: string) => (app.revealed ? text : redactText(text, [row._name]));
  return {
    ...publicRow(row),
    answers: app.job.questions.map((q) => ({ question: q.prompt, answer: show(row._answers[q.id] ?? "") })),
    mustHaves: (app.job.scorecard?.mustHaves ?? []).map((m) => ({
      label: m.label,
      met: json<Record<string, boolean>>(app.mustHaveAnswers, {})[m.id] === true,
    })),
    resume: app.resumeText ? show(app.resumeText) : null,
    resumeParsed: json<ParsedResume | null>(app.resumeParsed, null),
    contact: app.revealed
      ? {
          name: row._name,
          email: decrypt(app.candidate.emailEnc),
          phone: decrypt(app.candidate.phoneEnc),
          city: decrypt(app.candidate.addressEnc),
        }
      : null,
    model: app.evaluations[0]?.model ?? null,
    promptVersion: app.evaluations[0]?.promptVersion ?? null,
  };
}
