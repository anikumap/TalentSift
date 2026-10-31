import { isKeywordList, matchConcepts, type Concept } from "./concepts";
import { splitSentences, type Sentence } from "./normalize";
import { qualityModifier } from "./quality";

export type Rubric = { skillName: string; concepts: Concept[]; redFlags: Concept[]; strongWeight: number };
export type GradeTrace = { concepts: string[]; redFlags: string[]; quality: Record<string, number>; raw: number };
export type SkillResult = { score: 0 | 1 | 2 | 3 | 4; evidence: string[]; trace: GradeTrace };

const MAX_EVIDENCE = 2;
const MAX_EVIDENCE_CHARS = 240;
const RED_FLAG_CAP = 1;
const KEYWORD_LIST_CAP = 1;
const ENGAGED_FLOOR = 1;
/** With a red flag, the skill keeps its 1 only if at least this share of a strong answer is also there. */
const RED_FLAG_KEEP_RAW = 0.5;

function clip(s: string): string {
  return s.length > MAX_EVIDENCE_CHARS ? s.slice(0, MAX_EVIDENCE_CHARS) + "…" : s;
}

export type GradeOptions = {
  /** Sentences (raw text) never to quote — e.g. ones another skill's red flags caught in the same answer. */
  excludeEvidence?: ReadonlySet<string>;
};

/** Sentences with exact repeats removed, so pasting an answer several times changes nothing. */
function uniqueSentences(text: string): Sentence[] {
  const seen = new Set<string>();
  const out: Sentence[] = [];
  for (const s of splitSentences(text)) {
    const k = s.tokens.map((t) => t.text).join(" ");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...s, position: out.length });
  }
  return out;
}

/** Raw text of every sentence that trips any of these rubrics' red flags. */
export function redFlagSentences(text: string, rubrics: Rubric[]): Set<string> {
  const sentences = splitSentences(text);
  const out = new Set<string>();
  for (const r of rubrics) for (const h of matchConcepts(sentences, r.redFlags, { strict: false, everySentence: true })) out.add(sentences[h.sentence].raw);
  return out;
}

/** Score one skill from the candidate's answers. Deterministic; candidate text is only ever matched, never interpreted. */
export function gradeSkill(text: string, rubric: Rubric, opts: GradeOptions = {}): SkillResult {
  const sentences = uniqueSentences(text);
  text = sentences.map((s) => s.raw).join(" ");
  const hits = matchConcepts(sentences, rubric.concepts);
  const flagHits = matchConcepts(sentences, rubric.redFlags, { strict: false, everySentence: true });
  const flags = [...new Set(flagHits.map((f) => f.conceptId))];
  const conceptSentences = new Set(hits.map((h) => h.sentence));
  const quality = qualityModifier(text, sentences, conceptSentences);

  const matched = hits.reduce((a, h) => a + h.weight, 0);
  const raw = rubric.strongWeight > 0 ? matched / rubric.strongWeight : 0;
  let score = hits.length === 0 ? 0 : Math.max(0, Math.min(4, Math.round(4 * Math.min(raw, 1) + quality.total)));

  // "Touches the skill vaguely" is a 1: the skill's ideas are named (even without an action), or the
  // answer promises to deal with it in filler terms ("I will handle it properly").
  const namesIdeas = matchConcepts(sentences, rubric.concepts, { strict: false }).length > 0;
  if (namesIdeas || quality.parts.filler < 0) score = Math.max(score, ENGAGED_FLOOR);

  // An answer that is mostly a keyword list names ideas without saying what the person would do.
  const tokens = sentences.reduce((a, s) => a + s.tokens.length, 0);
  const listTokens = sentences.filter(isKeywordList).reduce((a, s) => a + s.tokens.length, 0);
  if (tokens > 0 && listTokens * 2 >= tokens) score = Math.min(score, KEYWORD_LIST_CAP);

  // Unsafe actions cap the skill at 1, or 0 when there is little good alongside them.
  if (flags.length > 0) score = raw >= RED_FLAG_KEEP_RAW ? Math.min(score, RED_FLAG_CAP) : 0;

  // Every sentence containing a red flag is excluded, not just the first one each flag fired in.
  const flagged = new Set(flagHits.map((f) => f.sentence));
  const weightBySentence = new Map<number, number>();
  for (const h of hits) if (!flagged.has(h.sentence) && !opts.excludeEvidence?.has(sentences[h.sentence].raw)) weightBySentence.set(h.sentence, (weightBySentence.get(h.sentence) ?? 0) + h.weight);
  const evidence = [...weightBySentence.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_EVIDENCE)
    .map(([i]) => clip(sentences[i].raw));

  return {
    score: score as SkillResult["score"],
    evidence,
    trace: { concepts: hits.map((h) => h.conceptId), redFlags: flags, quality: quality.parts, raw },
  };
}
