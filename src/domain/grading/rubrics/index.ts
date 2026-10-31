import { TEMPLATES } from "@/providers/ai/templates";
import { buildGenericRubric } from "../generic";
import type { Rubric } from "../grade";
import { CAREGIVER_RUBRICS } from "./caregiver";
import { DRIVER_RUBRICS } from "./driver";
import { RETAIL_RUBRICS } from "./retail";
import { WAREHOUSE_RUBRICS } from "./warehouse";

export const FAMILY_RUBRICS: Record<string, Rubric[]> = {
  caregiver: CAREGIVER_RUBRICS,
  warehouse: WAREHOUSE_RUBRICS,
  retail: RETAIL_RUBRICS,
  driver: DRIVER_RUBRICS,
};

const key = (name: string) => name.trim().toLowerCase();
const MIN_FAMILY_MATCHES = 2;

/** Rubrics with red flags whose name belongs to exactly one family. */
const SAFETY_BY_NAME: Map<string, Rubric> = (() => {
  const all = Object.values(FAMILY_RUBRICS).flat();
  const counts = new Map<string, number>();
  for (const r of all) counts.set(key(r.skillName), (counts.get(key(r.skillName)) ?? 0) + 1);
  return new Map(all.filter((r) => r.redFlags.length > 0 && counts.get(key(r.skillName)) === 1).map((r) => [key(r.skillName), r]));
})();

/**
 * Pick a rubric per skill. Scorecards store skill names, not the role family, and some names
 * ("Reliability") exist in every family — so the family is the one with the most name matches (at least two).
 * Skills it doesn't cover get a generic rubric built from their keywords.
 */
export function selectRubrics(skills: { name: string; keywords: string[] }[]): Map<string, Rubric> {
  const names = new Set(skills.map((s) => key(s.name)));
  let best: Rubric[] = [];
  let bestCount = 0;
  for (const t of TEMPLATES) {
    const rubrics = FAMILY_RUBRICS[t.family] ?? [];
    const count = rubrics.filter((r) => names.has(key(r.skillName))).length;
    // One shared name ("Teamwork") isn't enough to call the family; two or more is.
    if (count > bestCount && count >= MIN_FAMILY_MATCHES) {
      best = rubrics;
      bestCount = count;
    }
  }
  const byName = new Map(best.map((r) => [key(r.skillName), r]));
  // Safety rubrics (the ones with red flags) apply whenever their exact name appears, even after other
  // skills were renamed — a generic rubric has no red flags and would score unsafe answers as good.
  return new Map(skills.map((s) => [s.name, byName.get(key(s.name)) ?? SAFETY_BY_NAME.get(key(s.name)) ?? buildGenericRubric(s)]));
}
