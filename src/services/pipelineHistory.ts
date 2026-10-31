import { db } from "@/lib/db";
import { PIPELINE, type Stage } from "@/domain/constants";
import { pipelineIndex } from "@/domain/analytics";

export type StageEvent = { appId: string; from: Stage; to: Stage; reason: string | null; at: Date };

const stageOf = (json: string | null): Stage | null => {
  if (!json) return null;
  const v = JSON.parse(json) as { stage?: Stage };
  return v.stage ?? null;
};

/** Stage changes for these applications, oldest first, read from the append-only audit log. */
export async function stageEvents(orgId: string, appIds: string[]): Promise<StageEvent[]> {
  if (appIds.length === 0) return [];
  const rows = await db.auditEvent.findMany({
    where: { orgId, action: "STAGE_CHANGED", entityId: { in: appIds } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, before: true, after: true, reason: true, createdAt: true },
  });
  return rows.flatMap((r) => {
    const from = stageOf(r.before);
    const to = stageOf(r.after);
    return from && to ? [{ appId: r.entityId, from, to, reason: r.reason, at: r.createdAt }] : [];
  });
}

/** The furthest pipeline stage each application reached, so a candidate rejected at Interview counts as Interview. */
export function furthestStages(current: Map<string, Stage | null>, events: StageEvent[]): Map<string, Stage> {
  const best = new Map<string, number>();
  const bump = (id: string, s: Stage | null) => {
    if (s) best.set(id, Math.max(best.get(id) ?? 0, pipelineIndex(s)));
  };
  for (const [id, s] of current) {
    best.set(id, best.get(id) ?? 0);
    bump(id, s);
  }
  for (const e of events) {
    bump(e.appId, e.from);
    bump(e.appId, e.to);
  }
  return new Map([...best].map(([id, i]) => [id, PIPELINE[Math.max(0, i)]]));
}
