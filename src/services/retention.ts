import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, retentionCutoff, stripNote } from "@/domain/retention";
import { REJECT_REASONS } from "@/domain/constants";
import { audit } from "./audit";

export type PurgeResult = { orgId: string; candidates: number; applications: number; messages: number; cutoff: Date };

type Org = { id: string; retentionDays: number };
type Client = Prisma.TransactionClient | typeof db;

/** Candidates with no application touched since the cutoff. */
function expiredCandidates(orgId: string, cutoff: Date): Prisma.CandidateWhereInput {
  return { orgId, createdAt: { lt: cutoff }, applications: { none: { updatedAt: { gte: cutoff } } } };
}

/** Outbox emails to candidates (they hold the address in plain text and the name in the body). */
function expiredMessages(orgId: string, cutoff: Date): Prisma.MessageWhereInput {
  return { orgId, kind: { startsWith: "CANDIDATE_" }, createdAt: { lt: cutoff } };
}

async function countExpired(client: Client, org: Org, now: Date): Promise<PurgeResult & { ids: string[] }> {
  const cutoff = retentionCutoff(now, org.retentionDays);
  // Each application has its own candidate row, so one person can have several (same email hash).
  // A person is kept whole while any of their rows is still active.
  const [stale, active] = await Promise.all([
    client.candidate.findMany({ where: expiredCandidates(org.id, cutoff), select: { id: true, emailHash: true } }),
    client.candidate.findMany({ where: { orgId: org.id, NOT: expiredCandidates(org.id, cutoff) }, select: { emailHash: true } }),
  ]);
  const activeHashes = new Set(active.map((c) => c.emailHash));
  const ids = stale.filter((c) => !activeHashes.has(c.emailHash)).map((c) => c.id);
  const [applications, messages] = await Promise.all([
    ids.length ? client.application.count({ where: { candidateId: { in: ids } } }) : 0,
    client.message.count({ where: expiredMessages(org.id, cutoff) }),
  ]);
  return { orgId: org.id, candidates: ids.length, applications, messages, cutoff, ids };
}

async function purgeOrg(org: Org, now: Date, actor?: Actor): Promise<PurgeResult> {
  return db.$transaction(async (tx) => {
    const { ids, ...result } = await countExpired(tx, org, now);
    if (result.candidates === 0 && result.messages === 0) return result;
    // Applications and evaluations cascade from the candidate. Audit events stay, but decision notes are
    // recruiter free text that may name the person, so only the reason code is kept.
    const appIds = (await tx.application.findMany({ where: { candidateId: { in: ids } }, select: { id: true } })).map((a) => a.id);
    const noted = appIds.length
      ? await tx.auditEvent.findMany({ where: { action: "STAGE_CHANGED", entityId: { in: appIds }, reason: { not: null } }, select: { id: true, reason: true } })
      : [];
    for (const ev of noted) {
      const stripped = stripNote(ev.reason, REJECT_REASONS);
      if (stripped !== ev.reason) await tx.auditEvent.update({ where: { id: ev.id }, data: { reason: stripped } });
    }
    await tx.candidate.deleteMany({ where: { id: { in: ids } } });
    await tx.message.deleteMany({ where: expiredMessages(org.id, result.cutoff) });
    await audit(tx, {
      orgId: org.id,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "System",
      action: "RETENTION_PURGE",
      entityType: "Organization",
      entityId: org.id,
      reason: `Retention period of ${org.retentionDays} days`,
      after: { candidates: result.candidates, applications: result.applications, messages: result.messages, cutoff: result.cutoff.toISOString() },
    });
    return result;
  });
}

/**
 * Permanently erase candidate data older than each organisation's retention period.
 * Returns only the organisations where something was erased.
 */
export async function purgeExpired(now = new Date(), orgId?: string, actor?: Actor): Promise<PurgeResult[]> {
  if (actor) assertCan(actor, "org.admin");
  const orgs = await db.organization.findMany({ where: orgId ? { id: orgId } : {}, select: { id: true, retentionDays: true } });
  const results: PurgeResult[] = [];
  for (const org of orgs) {
    const r = await purgeOrg(org, now, actor);
    if (r.candidates > 0 || r.messages > 0) results.push(r);
  }
  return results;
}

/** What the next run would erase for the actor's organisation. */
export async function previewExpired(actor: Actor, now = new Date()): Promise<Omit<PurgeResult, "orgId"> & { retentionDays: number }> {
  assertCan(actor, "org.admin");
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { id: true, retentionDays: true } });
  const { candidates, applications, messages, cutoff } = await countExpired(db, org, now);
  return { candidates, applications, messages, cutoff, retentionDays: org.retentionDays };
}

export async function setRetentionDays(actor: Actor, days: number): Promise<void> {
  assertCan(actor, "org.admin");
  if (!Number.isInteger(days) || days < RETENTION_MIN_DAYS || days > RETENTION_MAX_DAYS) {
    throw new AppError("VALIDATION", `Choose a whole number of days between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS}.`, {
      days: `Between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS} days`,
    });
  }
  await db.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
    if (org.retentionDays === days) return;
    await tx.organization.update({ where: { id: org.id }, data: { retentionDays: days } });
    await audit(tx, {
      orgId: org.id,
      actorId: actor.id,
      actorName: actor.name,
      action: "RETENTION_CHANGED",
      entityType: "Organization",
      entityId: org.id,
      before: { retentionDays: org.retentionDays },
      after: { retentionDays: days },
    });
  });
}
