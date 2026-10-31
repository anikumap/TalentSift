import { db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { funnel, median, scoreBuckets } from "@/domain/analytics";
import type { Stage } from "@/domain/constants";
import { furthestStages, stageEvents } from "./pipelineHistory";

export const PERIODS = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
export type Period = keyof typeof PERIODS;

const DAY = 86_400_000;
const WAITING_DAYS = 2;
const days = (ms: number) => Math.round((ms / DAY) * 10) / 10;

/**
 * Funnel, speed, scores and rejection reasons. The applicant population comes from the audit log
 * (APPLICATION_SUBMITTED), so counts survive the retention purge; scores come from live applications.
 */
export async function getAnalytics(actor: Actor, { jobId, period }: { jobId?: string; period: Period }) {
  assertCan(actor, "stage.change");
  const now = Date.now();
  const since = period === "all" ? undefined : new Date(now - Number(period) * DAY);
  const submitted = await db.auditEvent.findMany({
    where: { orgId: actor.orgId, action: "APPLICATION_SUBMITTED", ...(jobId ? { jobId } : {}), ...(since ? { createdAt: { gte: since } } : {}) },
    select: { entityId: true, createdAt: true },
  });
  const ids = submitted.map((s) => s.entityId);
  const [live, events] = await Promise.all([
    ids.length
      ? db.application.findMany({ where: { id: { in: ids }, job: { orgId: actor.orgId } }, select: { id: true, stage: true, totalScore: true, createdAt: true } })
      : [],
    stageEvents(actor.orgId, ids),
  ]);

  const liveById = new Map(live.map((a) => [a.id, a]));
  const current = new Map(ids.map((id) => [id, (liveById.get(id)?.stage as Stage | undefined) ?? null]));
  const furthest = furthestStages(current, events);
  const submittedAt = new Map(submitted.map((s) => [s.entityId, s.createdAt.getTime()]));

  const firstDecision = new Map<string, number>();
  const hiredAt = new Map<string, number>();
  const reasons = new Map<string, number>();
  for (const e of events) {
    if (!firstDecision.has(e.appId)) firstDecision.set(e.appId, e.at.getTime());
    if (e.to === "HIRED") hiredAt.set(e.appId, e.at.getTime());
    if (e.to === "REJECTED") {
      const code = (e.reason ?? "No reason recorded").split(" — ")[0];
      reasons.set(code, (reasons.get(code) ?? 0) + 1);
    }
  }
  const sinceSubmit = (m: Map<string, number>) => [...m].map(([id, t]) => days(t - (submittedAt.get(id) ?? t)));

  return {
    total: ids.length,
    funnel: funnel(ids.map((id) => furthest.get(id) ?? "APPLIED")),
    medianDaysToDecision: median(sinceSubmit(firstDecision)),
    medianDaysToHire: median(sinceSubmit(hiredAt)),
    waiting: live.filter((a) => a.stage === "APPLIED" && a.createdAt.getTime() < now - WAITING_DAYS * DAY).length,
    scoreBuckets: scoreBuckets(live.map((a) => a.totalScore)),
    rejectionReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}
