import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { assertCan, type Actor } from "@/lib/rbac";
import { MIN_GROUP, comparable, impactRatios, selectionRates, type GroupRate } from "@/domain/fairness";
import { SELF_ID, SELF_ID_KEYS, type SelfIdKey } from "@/domain/selfid";
import type { Stage } from "@/domain/constants";
import { furthestStages, stageEvents } from "./pipelineHistory";

const DAY = 86_400_000;
/** Untouched applications younger than this are still undecided, so they don't count either way. */
const UNDECIDED_GRACE_DAYS = 7;
const REPORT_STAGES = ["SHORTLISTED", "INTERVIEW"] as const;
const FIELD: Record<SelfIdKey, "genderEnc" | "ageEnc" | "disabilityEnc"> = { gender: "genderEnc", age: "ageEnc", disability: "disabilityEnc" };

export type FairnessCharacteristic = {
  key: SelfIdKey;
  label: string;
  comparable: boolean;
  stages: { stage: (typeof REPORT_STAGES)[number]; rates: GroupRate[] }[];
  meanScore: Record<string, number | null>;
};

/**
 * Selection rates by self-described group, with four-fifths flags. The only reader of self-ID data,
 * and it only ever returns totals; groups under MIN_GROUP are suppressed.
 */
export async function getFairnessReport(actor: Actor, { jobId }: { jobId?: string }) {
  assertCan(actor, "fairness.view");
  const apps = await db.application.findMany({
    where: { job: { orgId: actor.orgId }, ...(jobId ? { jobId } : {}) },
    select: { id: true, stage: true, createdAt: true, totalScore: true, selfId: true },
  });
  const events = await stageEvents(actor.orgId, apps.map((a) => a.id));
  const furthest = furthestStages(new Map(apps.map((a) => [a.id, a.stage as Stage])), events);
  const touched = new Set(events.map((e) => e.appId));
  const cutoff = Date.now() - UNDECIDED_GRACE_DAYS * DAY;
  const eligible = apps.filter((a) => touched.has(a.id) || a.stage !== "APPLIED" || a.createdAt.getTime() < cutoff);

  const characteristics: FairnessCharacteristic[] = SELF_ID_KEYS.map((key) => {
    const rows = eligible.flatMap((a) => {
      const enc = a.selfId?.[FIELD[key]];
      return enc ? [{ group: decrypt(enc), reached: furthest.get(a.id) ?? "APPLIED", score: a.totalScore }] : [];
    });
    const stages = REPORT_STAGES.map((stage) => ({ stage, rates: impactRatios(selectionRates(rows, stage)) }));
    const meanScore: Record<string, number | null> = {};
    for (const r of stages[0].rates) {
      const scores = rows.filter((x) => x.group === r.group).map((x) => x.score);
      meanScore[r.group] = scores.length >= MIN_GROUP ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null;
    }
    return { key, label: SELF_ID[key].label, comparable: comparable(stages[0].rates), stages, meanScore };
  });

  return {
    total: apps.length,
    responded: apps.filter((a) => a.selfId && (a.selfId.genderEnc || a.selfId.ageEnc || a.selfId.disabilityEnc)).length,
    characteristics,
  };
}

