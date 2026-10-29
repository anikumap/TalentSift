import { db } from "@/lib/db";

// Children before parents so foreign keys never block a delete.
export async function resetDb(): Promise<void> {
  await db.$transaction([
    db.evaluation.deleteMany(),
    db.application.deleteMany(),
    db.candidate.deleteMany(),
    db.workSampleQuestion.deleteMany(),
    db.skill.deleteMany(),
    db.mustHave.deleteMany(),
    db.scorecard.deleteMany(),
    db.jobCredit.deleteMany(),
    db.job.deleteMany(),
    db.auditEvent.deleteMany(),
    db.message.deleteMany(),
    db.subscription.deleteMany(),
    db.session.deleteMany(),
    db.invite.deleteMany(),
    db.user.deleteMany(),
    db.organization.deleteMany(),
  ]);
}
