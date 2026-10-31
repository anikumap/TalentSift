import type { Concept, Pattern } from "../concepts";
import type { Rubric } from "../grade";

/** Share of a skill's total concept weight that counts as a "strong" (score 4) answer. */
export const STRONG_SHARE = 0.65;

export const any = (...words: string[]): Pattern => ({ any: words });
export const pair = (a: string[], b: string[], window?: number): Pattern => (window ? { pair: [a, b], window } : { pair: [a, b] });

export const concept = (id: string, weight: 1 | 2, ...patterns: Pattern[]): Concept => ({ id, weight, patterns });
/** Credited only when negated: "I would not move her" credits "doesn't move an injured person". */
export const avoids = (id: string, weight: 1 | 2, ...patterns: Pattern[]): Concept => ({ id, weight, patterns, invertsUnderNegation: true });
export const flag = (id: string, ...patterns: Pattern[]): Concept => ({ id, weight: 1, patterns });

export function rubric(skillName: string, concepts: Concept[], redFlags: Concept[] = []): Rubric {
  const total = concepts.reduce((a, c) => a + c.weight, 0);
  return { skillName, concepts, redFlags, strongWeight: STRONG_SHARE * total };
}
