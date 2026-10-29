import { db } from "@/lib/db";
import { assertCan, can, type Actor } from "@/lib/rbac";
import { AUDIT_ACTIONS, type AuditAction } from "@/domain/constants";

const DAY = 86_400_000;

export async function getDashboard(actor: Actor) {
  assertCan(actor, "candidate.view");
  const now = Date.now();
  const startOfDay = new Date(now - DAY);
  const [jobs, waitingOnYou, recentActivity, newToday] = await Promise.all([
    db.job.findMany({
      where: { orgId: actor.orgId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { _count: { select: { applications: true } } },
    }),
    db.application.count({
      where: { job: { orgId: actor.orgId }, stage: "APPLIED", createdAt: { lt: new Date(now - 2 * DAY) } },
    }),
    db.auditEvent.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.application.groupBy({
      by: ["jobId"],
      where: { job: { orgId: actor.orgId }, createdAt: { gte: startOfDay } },
      _count: { _all: true },
    }),
  ]);
  const newByJob = new Map(newToday.map((g) => [g.jobId, g._count._all]));
  return {
    openJobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      applicants: j._count.applications,
      newToday: newByJob.get(j.id) ?? 0,
    })),
    waitingOnYou,
    recentActivity,
  };
}

export async function listAudit(actor: Actor, filters: { jobId?: string; action?: string }) {
  assertCan(actor, "org.admin");
  const action = AUDIT_ACTIONS.includes(filters.action as AuditAction) ? filters.action : undefined;
  return db.auditEvent.findMany({
    where: {
      orgId: actor.orgId,
      ...(action ? { action } : {}),
      ...(filters.jobId ? { jobId: filters.jobId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function listOutbox(actor: Actor) {
  // Emails name candidates (even rejected ones never revealed on the shortlist), so only the
  // roles that send them may read them.
  assertCan(actor, "stage.change");
  // Team invites carry a live sign-up link; anyone holding it can claim the invited role.
  const kind = can(actor.role, "org.admin") ? undefined : { not: "INVITE_MEMBER" };
  return db.message.findMany({ where: { orgId: actor.orgId, kind }, orderBy: { createdAt: "desc" }, take: 200 });
}
