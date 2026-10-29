import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import { REJECT_REASONS, STAGE_LABELS, STAGES, type RejectReason, type Stage } from "@/domain/constants";
import { canTransition } from "@/domain/stages";
import { audit } from "./audit";
import { inviteEmail, rejectionEmail } from "./emails";

const reasonSchema = z.object({
  code: z.enum(REJECT_REASONS, { errorMap: () => ({ message: "Choose a reason from the list" }) }),
  note: z.string().trim().max(500).optional(),
});

/** Stages after which the reviewer has decided to engage with the person, so identity is shown. */
const REVEAL_AT: Stage[] = ["SHORTLISTED", "INTERVIEW", "OFFER", "HIRED"];

/** The only way an application changes stage. Always a human actor; always audited. */
export async function changeStage(
  actor: Actor,
  appId: string,
  toStage: Stage,
  reason?: { code: RejectReason; note?: string },
): Promise<void> {
  assertCan(actor, "stage.change");
  if (!(STAGES as readonly string[]).includes(toStage)) throw new AppError("VALIDATION", "Unknown stage.");

  const app = await db.application.findFirst({
    where: { id: appId, job: { orgId: actor.orgId } },
    include: { candidate: true, job: { include: { org: true } } },
  });
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  const from = app.stage as Stage;
  if (!canTransition(from, toStage)) {
    throw new AppError("VALIDATION", `Can't move from ${STAGE_LABELS[from]} to ${STAGE_LABELS[toStage]}.`);
  }

  let reasonText: string | null = null;
  if (toStage === "REJECTED") {
    if (!reason) throw new AppError("VALIDATION", "Choose a reason before rejecting.", { reason: "Required" });
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("VALIDATION", "Choose a reason from the list.", { reason: "Invalid" });
    reasonText = r.data.note ? `${r.data.code} — ${r.data.note}` : r.data.code;
  } else if (reason?.note) {
    reasonText = reason.note.slice(0, 500);
  }

  const reveal = !app.revealed && REVEAL_AT.includes(toStage);
  const base = { orgId: actor.orgId, actorId: actor.id, actorName: actor.name, entityType: "Application", entityId: appId, jobId: app.jobId };

  await db.$transaction(async (tx) => {
    await tx.application.update({ where: { id: appId }, data: { stage: toStage, ...(reveal ? { revealed: true } : {}) } });
    await audit(tx, { ...base, action: "STAGE_CHANGED", reason: reasonText, before: { stage: from }, after: { stage: toStage } });
    if (reveal) await audit(tx, { ...base, action: "IDENTITY_REVEALED", reason: `Advanced to ${STAGE_LABELS[toStage]}` });
  });

  const name = decrypt(app.candidate.nameEnc);
  const to = decrypt(app.candidate.emailEnc);
  const email =
    toStage === "SHORTLISTED"
      ? { kind: "CANDIDATE_INVITE", ...inviteEmail(name, app.job.title, app.job.org.name) }
      : toStage === "REJECTED"
        ? { kind: "CANDIDATE_REJECTION", ...rejectionEmail(name, app.job.title, app.job.org.name) }
        : null;
  if (email) await getProviders().email.send({ orgId: actor.orgId, to, ...email });
}
