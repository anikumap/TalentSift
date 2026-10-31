import type { Concept } from "./concepts";
import type { Rubric } from "./grade";
import { SYNONYMS, groupsContaining } from "./lexicon";
import { stem } from "./normalize";

const STRONG_SHARE = 0.6;

const GENERIC_ACTIONS: Concept[] = [
  { id: "gen:inform", weight: 1, patterns: [{ pair: [["@inform"], ["@supervisor", "@family", "@medical", "chef", "customer", "team"]] }] },
  { id: "gen:check", weight: 1, patterns: [{ any: ["@check"] }] },
  { id: "gen:calm", weight: 1, patterns: [{ any: ["@calm"] }] },
  { id: "gen:followup", weight: 1, patterns: [{ any: ["@followup", "@record"] }] },
];

/** A rubric for a skill no role-family rubric covers (custom roles, renamed skills). */
export function buildGenericRubric(skill: { name: string; keywords: string[] }): Rubric {
  const seen = new Set<string>();
  const keywordConcepts: Concept[] = [];
  for (const raw of skill.keywords) {
    // Keywords are recruiter-typed data; a leading "@" must not be read as a lexicon group reference.
    const kw = raw.trim().toLowerCase().replace(/^@+/, "").trim();
    if (!kw) continue;
    const key = kw.split(/\s+/).map(stem).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    const synonyms = groupsContaining(kw).flatMap((g) => SYNONYMS[g]);
    keywordConcepts.push({ id: `kw:${kw}`, weight: 1, patterns: [{ any: [kw, ...synonyms] }] });
  }
  const concepts = [...keywordConcepts, ...GENERIC_ACTIONS];
  const total = concepts.reduce((a, c) => a + c.weight, 0);
  return { skillName: skill.name, concepts, redFlags: [], strongWeight: STRONG_SHARE * total };
}
