export type ParsedResume = { certifications: string[]; yearsExperience: number; titles: string[] };

/** Integer weights summing to exactly 100 (largest-remainder rounding). */
export function normalizeWeights(weights: number[]): number[] {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  const raw = sum === 0 ? clean.map(() => 100 / clean.length) : clean.map((w) => (w / sum) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** 0–100. Skills carry 90% when a resume signal exists, otherwise 100%. */
export function computeTotal(
  skills: { id: string; weight: number }[],
  grades: { skillId: string; score: number }[],
  resumeSignal: number | null,
): number {
  const byId = new Map(grades.map((g) => [g.skillId, g.score]));
  const skillPart = skills.reduce((acc, s) => acc + (s.weight / 100) * ((byId.get(s.id) ?? 0) / 4), 0);
  const total = resumeSignal === null ? skillPart : 0.9 * skillPart + 0.1 * resumeSignal;
  return Math.round(100 * total);
}

/** 0–1: half from experience (capped at 5 years), half from a relevant certification. */
export function resumeSignal(parsed: ParsedResume, keywords: string[]): number {
  const years = Math.min(Math.max(parsed.yearsExperience, 0), 5) / 5;
  const kw = keywords.map((k) => k.toLowerCase());
  const certMatch = parsed.certifications.some((c) => kw.some((k) => c.toLowerCase().includes(k)));
  return 0.5 * years + 0.5 * (certMatch ? 1 : 0);
}
