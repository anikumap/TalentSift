import type { Prisma } from "@prisma/client";
import type { AuditAction } from "@/domain/constants";

export type AuditEntry = {
  orgId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  jobId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Append-only. Call inside the same transaction as the change it records. */
export async function audit(tx: Prisma.TransactionClient, e: AuditEntry): Promise<void> {
  await tx.auditEvent.create({
    data: {
      orgId: e.orgId,
      actorId: e.actorId ?? null,
      actorName: e.actorName ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      jobId: e.jobId ?? null,
      reason: e.reason ?? null,
      before: e.before === undefined ? null : JSON.stringify(e.before),
      after: e.after === undefined ? null : JSON.stringify(e.after),
    },
  });
}
