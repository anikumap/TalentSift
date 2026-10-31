import { PIPELINE, type Stage } from "./constants";

export type FunnelStep = { stage: Stage; count: number; conversion: number | null };

/** Position in the hiring pipeline; -1 for Rejected / On hold, which sit outside it. */
export function pipelineIndex(stage: Stage): number {
  return (PIPELINE as readonly string[]).indexOf(stage);
}

/** How many applications reached each pipeline step, given each one's furthest stage. */
export function funnel(reached: Stage[]): FunnelStep[] {
  const furthest = reached.map((s) => Math.max(0, pipelineIndex(s)));
  return PIPELINE.map((stage, i) => {
    const count = furthest.filter((f) => f >= i).length;
    return { stage, count, conversion: null as number | null };
  }).map((step, i, all) => ({ ...step, conversion: i === 0 || all[i - 1].count === 0 ? null : step.count / all[i - 1].count }));
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Counts in 0–19, 20–39, 40–59, 60–79, 80–100. */
export function scoreBuckets(scores: number[]): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const s of scores) out[Math.min(4, Math.max(0, Math.floor(s / 20)))]++;
  return out;
}
