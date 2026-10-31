import type { Stage } from "./constants";
import { pipelineIndex } from "./analytics";

/** EEOC "four-fifths" rule of thumb: a group selected at under 80% of the best group's rate is flagged. */
export const FOUR_FIFTHS = 0.8;
/** Groups smaller than this aren't reported: too noisy, and small enough to identify people. */
export const MIN_GROUP = 5;

export type GroupRate = { group: string; n: number; selected: number; rate: number | null; ratio: number | null; flagged: boolean };

/** Share of each group that reached `stage` or later. */
export function selectionRates(rows: { group: string; reached: Stage }[], stage: Stage, minGroup = MIN_GROUP): GroupRate[] {
  const target = pipelineIndex(stage);
  const byGroup = new Map<string, { n: number; selected: number }>();
  for (const r of rows) {
    const g = byGroup.get(r.group) ?? { n: 0, selected: 0 };
    g.n++;
    if (pipelineIndex(r.reached) >= target) g.selected++;
    byGroup.set(r.group, g);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, { n, selected }]) => ({ group, n, selected, rate: n >= minGroup ? selected / n : null, ratio: null, flagged: false }));
}

/** Each reportable group's rate relative to the best reportable group's. */
export function impactRatios(rates: GroupRate[]): GroupRate[] {
  const best = Math.max(0, ...rates.map((r) => r.rate ?? 0));
  return rates.map((r) => {
    if (r.rate === null || best === 0) return { ...r, ratio: null, flagged: false };
    const ratio = r.rate / best;
    return { ...r, ratio, flagged: ratio < FOUR_FIFTHS };
  });
}

export function comparable(rates: GroupRate[]): boolean {
  return rates.filter((r) => r.rate !== null).length >= 2;
}
