import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { assertCan, can, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import { INTERVIEW_MODE_LABELS, INTERVIEW_MODES, type InterviewMode } from "@/domain/constants";
import {
  MAX_SLOTS_PER_BATCH,
  SLOT_MAX_LENGTH,
  SLOT_MIN_LENGTH,
  canCandidateChange,
  istDateTime,
  overlaps,
  slotTimes,
  toIcs,
} from "@/domain/interviews";
import { audit } from "./audit";
import { resolveLink } from "./candidateLinks";
import { interviewCancelledEmail, interviewConfirmedEmail } from "./emails";

type Tx = Prisma.TransactionClient;

const slotInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  from: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
  to: z.string().regex(/^\d{2}:\d{2}$/, "Choose an end time"),
  lengthMin: z.coerce.number().int().min(SLOT_MIN_LENGTH).max(SLOT_MAX_LENGTH),
  interviewerId: z.string().min(1, "Choose an interviewer"),
  mode: z.enum(INTERVIEW_MODES),
  location: z.string().trim().min(1, "Say where, or which number or link to use").max(200),
});
export type SlotInput = z.input<typeof slotInput>;

export type SlotRow = {
  id: string;
  startsAt: Date;
  durationMin: number;
  mode: InterviewMode;
  location: string;
  interviewerName: string;
  booked: { appId: string; displayName: string } | null;
};

export type OpenSlot = { id: string; startsAt: Date; durationMin: number; mode: InterviewMode };

export type BookingPage =
  | { state: "invalid" }
  | { state: "closed"; orgName: string; jobTitle: string }
  | { state: "choose"; orgName: string; jobTitle: string; slots: OpenSlot[] }
  | {
      state: "booked";
      orgName: string;
      jobTitle: string;
      interview: { id: string; startsAt: Date; durationMin: number; mode: InterviewMode; location: string; canChange: boolean };
      slots: OpenSlot[];
    };

export type InterviewRow = {
  interviewId: string;
  appId: string;
  jobId: string;
  jobTitle: string;
  displayName: string;
  startsAt: Date;
  durationMin: number;
  mode: InterviewMode;
  location: string;
  status: string;
  interviewerId: string;
  interviewerName: string;
  hasFeedback: boolean;
};

const touch = (tx: Tx, appId: string) => tx.application.update({ where: { id: appId }, data: { updatedAt: new Date() } });

const displayName = (app: { revealed: boolean; publicRef: string; candidate: { nameEnc: string } }) =>
  app.revealed ? decrypt(app.candidate.nameEnc) : `Candidate #${app.publicRef}`;

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

async function openSlots(jobId: string, now = new Date()): Promise<OpenSlot[]> {
  const slots = await db.interviewSlot.findMany({
    where: { jobId, startsAt: { gt: now }, interview: null },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, durationMin: true, mode: true },
  });
  return slots.map((s) => ({ ...s, mode: s.mode as InterviewMode }));
}

/** True if the job has at least one bookable time. */
export async function hasOpenSlots(tx: Tx, jobId: string, now = new Date()): Promise<boolean> {
  return (await tx.interviewSlot.count({ where: { jobId, startsAt: { gt: now }, interview: null } })) > 0;
}

// ---------- Slots ----------

export async function addSlots(actor: Actor, jobId: string, input: SlotInput): Promise<number> {
  assertCan(actor, "interview.manage");
  const job = await db.job.findFirst({ where: { id: jobId, orgId: actor.orgId } });
  if (!job) throw new AppError("NOT_FOUND", "Job not found.");
  const parsed = slotInput.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    throw new AppError("VALIDATION", "Check the highlighted fields.", fields);
  }
  const data = parsed.data;
  const interviewer = await db.user.findFirst({ where: { id: data.interviewerId, orgId: actor.orgId } });
  if (!interviewer) throw new AppError("VALIDATION", "Choose someone from your team.", { interviewerId: "Not on your team" });

  let times: Date[];
  try {
    times = slotTimes(data.date, data.from, data.to, data.lengthMin);
  } catch {
    throw new AppError("VALIDATION", "That date or time isn't valid.", { date: "Invalid date" });
  }
  if (times.length === 0) throw new AppError("VALIDATION", "The end time must leave room for at least one interview.", { to: "Too early" });
  if (times.length > MAX_SLOTS_PER_BATCH) {
    throw new AppError("VALIDATION", `That makes ${times.length} slots. Add at most ${MAX_SLOTS_PER_BATCH} at a time.`, { to: "Too many slots" });
  }
  if (times[0].getTime() <= Date.now()) throw new AppError("VALIDATION", "Interview times must be in the future.", { date: "In the past" });

  const span = (t: Date) => ({ startsAt: t, durationMin: data.lengthMin });
  const windowStart = new Date(times[0].getTime() - SLOT_MAX_LENGTH * 60_000);
  const windowEnd = new Date(times[times.length - 1].getTime() + SLOT_MAX_LENGTH * 60_000);

  return db.$transaction(async (tx) => {
    const existing = await tx.interviewSlot.findMany({
      where: { interviewerId: interviewer.id, startsAt: { gte: windowStart, lte: windowEnd } },
      select: { startsAt: true, durationMin: true },
    });
    if (times.some((t) => existing.some((e) => overlaps(span(t), e)))) {
      throw new AppError("VALIDATION", `${interviewer.name} already has interview times that overlap these.`, { from: "Overlaps" });
    }
    await tx.interviewSlot.createMany({
      data: times.map((startsAt) => ({
        jobId,
        interviewerId: interviewer.id,
        startsAt,
        durationMin: data.lengthMin,
        mode: data.mode,
        location: data.location,
      })),
    });
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "INTERVIEW_SLOTS_ADDED",
      entityType: "Job",
      entityId: jobId,
      jobId,
      after: { count: times.length, interviewerId: interviewer.id, first: times[0].toISOString() },
    });
    return times.length;
  });
}

export async function deleteSlot(actor: Actor, slotId: string): Promise<void> {
  assertCan(actor, "interview.manage");
  const slot = await db.interviewSlot.findFirst({ where: { id: slotId, job: { orgId: actor.orgId } }, include: { interview: true } });
  if (!slot) throw new AppError("NOT_FOUND", "Slot not found.");
  if (slot.interview) throw new AppError("CONFLICT", "Someone is booked into this time. Cancel their interview first.");
  await db.interviewSlot.delete({ where: { id: slotId } });
}

export async function listSlots(actor: Actor, jobId: string): Promise<SlotRow[]> {
  assertCan(actor, "interview.view");
  const slots = await db.interviewSlot.findMany({
    where: { jobId, job: { orgId: actor.orgId }, startsAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    include: { interviewer: { select: { name: true } }, interview: { include: { application: { include: { candidate: true } } } } },
  });
  return slots.map((s) => ({
    id: s.id,
    startsAt: s.startsAt,
    durationMin: s.durationMin,
    mode: s.mode as InterviewMode,
    location: s.location,
    interviewerName: s.interviewer.name,
    booked: s.interview ? { appId: s.interview.applicationId, displayName: displayName(s.interview.application) } : null,
  }));
}

// ---------- Booking ----------

type AppForBooking = Prisma.ApplicationGetPayload<{ include: { candidate: true; job: { include: { org: true } } } }>;

const loadApp = (where: Prisma.ApplicationWhereInput) =>
  db.application.findFirst({ where, include: { candidate: true, job: { include: { org: true } } } });

const scheduled = (tx: Tx | typeof db, appId: string) =>
  tx.interview.findFirst({ where: { applicationId: appId, status: "SCHEDULED" }, orderBy: { startsAt: "asc" } });

async function cancelRow(tx: Tx, interviewId: string) {
  await tx.interview.update({ where: { id: interviewId }, data: { status: "CANCELLED", slotId: null } });
}

/**
 * Books `slotId` for the application, replacing any scheduled interview. Shared by the candidate link and
 * the team. `actor` null means the candidate is acting, which enforces the 12-hour change window.
 */
async function book(app: AppForBooking, slotId: string, actor: Actor | null): Promise<void> {
  if (app.stage !== "INTERVIEW") throw new AppError("CONFLICT", "This position is no longer open for interviews.");
  const now = new Date();
  const created = await db
    .$transaction(async (tx) => {
      const slot = await tx.interviewSlot.findFirst({ where: { id: slotId, jobId: app.jobId }, include: { interview: true } });
      if (!slot) throw new AppError("NOT_FOUND", "That interview time doesn't exist.");
      if (slot.startsAt <= now) throw new AppError("CONFLICT", "That time has already passed. Please pick another.");
      const current = await scheduled(tx, app.id);
      if (current?.slotId === slotId) return null;
      if (slot.interview) throw new AppError("CONFLICT", "Sorry, someone just took that time. Please pick another.");
      if (current) {
        if (!actor && !canCandidateChange(current.startsAt, now)) {
          throw new AppError("VALIDATION", "It's less than 12 hours to your interview, so it can't be changed here. Please reply to our email.");
        }
        await cancelRow(tx, current.id);
      }
      const iv = await tx.interview.create({
        data: {
          applicationId: app.id,
          slotId: slot.id,
          interviewerId: slot.interviewerId,
          startsAt: slot.startsAt,
          durationMin: slot.durationMin,
          mode: slot.mode,
          location: slot.location,
          bookedBy: actor ? "TEAM" : "CANDIDATE",
        },
      });
      await touch(tx, app.id);
      await audit(tx, {
        orgId: app.job.orgId,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? "Candidate",
        action: "INTERVIEW_BOOKED",
        entityType: "Application",
        entityId: app.id,
        jobId: app.jobId,
        after: { interviewId: iv.id, startsAt: iv.startsAt.toISOString(), replaced: current?.id ?? null },
      });
      return iv;
    })
    .catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034")) {
        throw new AppError("CONFLICT", "Sorry, someone just took that time. Please pick another.");
      }
      throw e;
    });
  if (!created) return;
  const name = decrypt(app.candidate.nameEnc);
  await getProviders().email.send({
    orgId: app.job.orgId,
    to: decrypt(app.candidate.emailEnc),
    kind: "CANDIDATE_INTERVIEW_CONFIRMED",
    ...interviewConfirmedEmail(name, app.job.title, app.job.org.name, istDateTime(created.startsAt), INTERVIEW_MODE_LABELS[created.mode as InterviewMode], created.location),
  });
}

async function sendCancelled(app: AppForBooking) {
  await getProviders().email.send({
    orgId: app.job.orgId,
    to: decrypt(app.candidate.emailEnc),
    kind: "CANDIDATE_INTERVIEW_CANCELLED",
    ...interviewCancelledEmail(decrypt(app.candidate.nameEnc), app.job.title, app.job.org.name),
  });
}

async function appForToken(token: string): Promise<AppForBooking | null> {
  const link = await resolveLink(token, "BOOKING");
  return link ? loadApp({ id: link.applicationId }) : null;
}

export async function getBookingPage(token: string): Promise<BookingPage> {
  const app = await appForToken(token);
  if (!app) return { state: "invalid" };
  const head = { orgName: app.job.org.name, jobTitle: app.job.title };
  if (app.stage !== "INTERVIEW") return { state: "closed", ...head };
  const [current, slots] = await Promise.all([scheduled(db, app.id), openSlots(app.jobId)]);
  if (!current) return { state: "choose", ...head, slots };
  return {
    state: "booked",
    ...head,
    slots,
    interview: {
      id: current.id,
      startsAt: current.startsAt,
      durationMin: current.durationMin,
      mode: current.mode as InterviewMode,
      location: current.location,
      canChange: canCandidateChange(current.startsAt, new Date()),
    },
  };
}

export async function bookByToken(token: string, slotId: string): Promise<void> {
  const app = await appForToken(token);
  if (!app) throw new AppError("NOT_FOUND", "This link has expired. Please reply to our email for a new one.");
  await book(app, slotId, null);
}

export async function cancelByToken(token: string): Promise<void> {
  const app = await appForToken(token);
  if (!app) throw new AppError("NOT_FOUND", "This link has expired. Please reply to our email for a new one.");
  const current = await scheduled(db, app.id);
  if (!current) throw new AppError("NOT_FOUND", "You don't have an interview booked.");
  if (!canCandidateChange(current.startsAt, new Date())) {
    throw new AppError("VALIDATION", "It's less than 12 hours to your interview, so it can't be cancelled here. Please reply to our email.");
  }
  await db.$transaction(async (tx) => {
    await cancelRow(tx, current.id);
    await touch(tx, app.id);
    await audit(tx, {
      orgId: app.job.orgId,
      actorName: "Candidate",
      action: "INTERVIEW_CANCELLED",
      entityType: "Application",
      entityId: app.id,
      jobId: app.jobId,
      after: { interviewId: current.id },
    });
  });
  await sendCancelled(app);
}

export async function bookForCandidate(actor: Actor, appId: string, slotId: string): Promise<void> {
  assertCan(actor, "interview.manage");
  const app = await loadApp({ id: appId, job: { orgId: actor.orgId } });
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  await book(app, slotId, actor);
}

async function managedInterview(actor: Actor, interviewId: string) {
  assertCan(actor, "interview.manage");
  const iv = await db.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId: actor.orgId } } },
    include: { application: { include: { candidate: true, job: { include: { org: true } } } } },
  });
  if (!iv) throw new AppError("NOT_FOUND", "Interview not found.");
  return iv;
}

export async function cancelInterview(actor: Actor, interviewId: string, reason?: string): Promise<void> {
  const iv = await managedInterview(actor, interviewId);
  if (iv.status !== "SCHEDULED") throw new AppError("VALIDATION", "Only scheduled interviews can be cancelled.");
  await db.$transaction(async (tx) => {
    await cancelRow(tx, iv.id);
    await touch(tx, iv.applicationId);
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "INTERVIEW_CANCELLED",
      entityType: "Application",
      entityId: iv.applicationId,
      jobId: iv.application.jobId,
      reason: reason?.trim().slice(0, 500) || null,
      after: { interviewId: iv.id },
    });
  });
  await sendCancelled(iv.application);
}

export async function setInterviewStatus(actor: Actor, interviewId: string, status: "COMPLETED" | "NO_SHOW"): Promise<void> {
  const iv = await managedInterview(actor, interviewId);
  if (!["COMPLETED", "NO_SHOW"].includes(status)) throw new AppError("VALIDATION", "Unknown status.");
  if (iv.status !== "SCHEDULED") throw new AppError("VALIDATION", "This interview is already closed.");
  if (iv.startsAt > new Date()) throw new AppError("VALIDATION", "This interview hasn't happened yet.");
  await db.$transaction(async (tx) => {
    await tx.interview.update({ where: { id: iv.id }, data: { status } });
    await touch(tx, iv.applicationId);
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "INTERVIEW_STATUS_CHANGED",
      entityType: "Application",
      entityId: iv.applicationId,
      jobId: iv.application.jobId,
      before: { status: iv.status },
      after: { interviewId: iv.id, status },
    });
  });
}

// ---------- Lists ----------

const rowInclude = { application: { include: { candidate: true, job: { select: { id: true, title: true } } } }, feedback: { select: { id: true } } } as const;
type RowSource = Prisma.InterviewGetPayload<{ include: typeof rowInclude }>;

async function toRows(ivs: RowSource[]): Promise<InterviewRow[]> {
  const names = await userNames(ivs.map((i) => i.interviewerId));
  return ivs.map((i) => ({
    interviewId: i.id,
    appId: i.applicationId,
    jobId: i.application.job.id,
    jobTitle: i.application.job.title,
    displayName: displayName(i.application),
    startsAt: i.startsAt,
    durationMin: i.durationMin,
    mode: i.mode as InterviewMode,
    location: i.location,
    status: i.status,
    interviewerId: i.interviewerId,
    interviewerName: names.get(i.interviewerId) ?? "Former team member",
    hasFeedback: Boolean(i.feedback),
  }));
}

export async function listInterviewsForApp(actor: Actor, appId: string): Promise<InterviewRow[]> {
  assertCan(actor, "interview.view");
  const ivs = await db.interview.findMany({
    where: { applicationId: appId, application: { job: { orgId: actor.orgId } } },
    orderBy: { startsAt: "asc" },
    include: rowInclude,
  });
  return toRows(ivs);
}

/** Upcoming interviews, and past ones assigned to the actor that still need feedback. */
export async function listMyInterviews(
  actor: Actor,
  { mineOnly, now = new Date() }: { mineOnly: boolean; now?: Date },
): Promise<{ upcoming: InterviewRow[]; feedbackDue: InterviewRow[] }> {
  assertCan(actor, "interview.view");
  const onlyMine = mineOnly || !can(actor.role, "interview.manage");
  const org = { application: { job: { orgId: actor.orgId } } };
  const [upcoming, due] = await Promise.all([
    db.interview.findMany({
      where: { ...org, status: "SCHEDULED", startsAt: { gt: now }, ...(onlyMine ? { interviewerId: actor.id } : {}) },
      orderBy: { startsAt: "asc" },
      include: rowInclude,
    }),
    db.interview.findMany({
      where: { ...org, interviewerId: actor.id, status: { in: ["SCHEDULED", "COMPLETED"] }, startsAt: { lte: now }, feedback: null },
      orderBy: { startsAt: "asc" },
      include: rowInclude,
    }),
  ]);
  return { upcoming: await toRows(upcoming), feedbackDue: await toRows(due) };
}

function icsFor(iv: { id: string; startsAt: Date; durationMin: number; mode: string; location: string }, jobTitle: string, orgName: string, who: string) {
  return toIcs({
    uid: iv.id,
    startsAt: iv.startsAt,
    durationMin: iv.durationMin,
    summary: `Interview: ${jobTitle} (${orgName})`,
    location: iv.location,
    description: `${INTERVIEW_MODE_LABELS[iv.mode as InterviewMode]} interview with ${who}.`,
  });
}

export async function interviewIcs(actor: Actor, interviewId: string): Promise<string> {
  assertCan(actor, "interview.view");
  const iv = await db.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId: actor.orgId } } },
    include: { application: { include: { candidate: true, job: { include: { org: true } } } } },
  });
  if (!iv) throw new AppError("NOT_FOUND", "Interview not found.");
  return icsFor(iv, iv.application.job.title, iv.application.job.org.name, displayName(iv.application));
}

export async function interviewIcsByToken(token: string): Promise<string | null> {
  const app = await appForToken(token);
  if (!app || app.stage !== "INTERVIEW") return null;
  const current = await scheduled(db, app.id);
  return current ? icsFor(current, app.job.title, app.job.org.name, app.job.org.name) : null;
}
