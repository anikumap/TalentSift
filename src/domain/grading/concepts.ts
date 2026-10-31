import { ACTION_VERBS, AUXILIARIES, expand } from "./lexicon";
import { clauseBreaks, markNegated } from "./negation";
import { tokenize, type Sentence } from "./normalize";

export type Pattern = { any: string[] } | { pair: [string[], string[]]; window?: number } | { phrase: string };
export type Concept = { id: string; weight: 1 | 2; patterns: Pattern[]; invertsUnderNegation?: boolean };
export type ConceptHit = { conceptId: string; weight: number; sentence: number };

/** Max tokens allowed between the two halves of a pair. */
const PAIR_WINDOW = 6;

type Match = { start: number; end: number; negated: boolean };

const termCache = new Map<string, string[][]>();

/** Each term as a list of stems, with "@group" references expanded. */
function terms(words: string[]): string[][] {
  const key = words.join("|");
  let cached = termCache.get(key);
  if (!cached) {
    cached = words.flatMap(expand).map((w) => tokenize(w).map((t) => t.stem)).filter((s) => s.length > 0);
    termCache.set(key, cached);
  }
  return cached;
}

function findTerms(stems: string[], words: string[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const term of terms(words)) {
    for (let i = 0; i + term.length <= stems.length; i++) {
      if (term.every((s, k) => stems[i + k] === s)) out.push({ start: i, end: i + term.length - 1 });
    }
  }
  return out;
}

function patternMatches(p: Pattern, stems: string[], negated: boolean[]): Match[] {
  // A match is negated by a negator before it, not by one inside it ("not my problem", "avoid flooded roads").
  const isNeg = (start: number, _end: number) => negated[start];
  if ("any" in p) return findTerms(stems, p.any).map((m) => ({ ...m, negated: isNeg(m.start, m.end) }));
  if ("phrase" in p) return findTerms(stems, [p.phrase]).map((m) => ({ ...m, negated: isNeg(m.start, m.end) }));
  const window = p.window ?? PAIR_WINDOW;
  const as = findTerms(stems, p.pair[0]);
  const bs = findTerms(stems, p.pair[1]);
  const out: Match[] = [];
  for (const a of as) {
    for (const b of bs) {
      if (b.start > a.end && b.start - a.end - 1 <= window) out.push({ start: a.start, end: b.end, negated: isNeg(a.start, a.end) });
    }
  }
  return out;
}

const CLAUSE_WORDS = new Set(["and", "then", "but", "so", "or"]);
const INHERIT_MAX_TOKENS = 2;
const LIST_MIN_SEGMENTS = 3;
const LIST_SHORT_SHARE = 0.75;
/** "Calm is important." / "Gloves are needed." names an idea without anyone doing anything. */
const SLOGAN = /^(\S+ ){1,3}(is|are|was|were) (very |also |most |so )?(important|needed|necessary|required|essential|key|must|compulsory|checked|told|done|good|best|priority)$/;

type SentenceShape = { qualifies: boolean[]; isList: boolean };

/**
 * Per token: does its clause describe an action? Clauses split at commas and at and/then/but/so/or.
 * A clause of ≤2 words with no verb ("the SKU") inherits from a neighbouring clause.
 * A sentence of mostly 1–2 word comma segments is a keyword list.
 */
function shape(s: Sentence, negated: boolean[]): SentenceShape {
  const breaks = clauseBreaks(s.raw);
  const clauseOf: number[] = [];
  const sizes: number[] = [0];
  const verbs: boolean[] = [false];
  let c = 0;
  s.tokens.forEach((t, i) => {
    if (CLAUSE_WORDS.has(t.text) && sizes[c] > 0) {
      c++;
      sizes.push(0);
      verbs.push(false);
    }
    clauseOf.push(c);
    if (!CLAUSE_WORDS.has(t.text)) sizes[c]++;
    if (!negated[i] && ACTION_VERBS.has(t.stem) && !AUXILIARIES.has(t.stem)) verbs[c] = true;
    if (breaks.has(i) && i < s.tokens.length - 1) {
      c++;
      sizes.push(0);
      verbs.push(false);
    }
  });
  const ok: boolean[] = [];
  // Short clauses inherit from either side: "the SKU and the label" after a verb, or "Raincoat and parcel cover I will use".
  for (let k = 0; k < sizes.length; k++) {
    ok.push(verbs[k] || (sizes[k] <= INHERIT_MAX_TOKENS && ((k > 0 && ok[k - 1]) || verbs[k + 1] === true)));
  }

  const segments: number[] = [0];
  s.tokens.forEach((_, i) => {
    segments[segments.length - 1]++;
    if (breaks.has(i) && i < s.tokens.length - 1) segments.push(0);
  });
  const short = segments.filter((n) => n <= INHERIT_MAX_TOKENS).length;
  const isList =
    (segments.length >= LIST_MIN_SEGMENTS && short / segments.length >= LIST_SHORT_SHARE) || SLOGAN.test(s.tokens.map((t) => t.text).join(" "));
  return { qualifies: clauseOf.map((k) => ok[k]), isList };
}

function conceptCounts(c: Concept, stems: string[], negated: boolean[], qualifies: boolean[] | null): boolean {
  const matches = c.patterns.flatMap((p) => patternMatches(p, stems, negated));
  return matches.some((m) => (c.invertsUnderNegation ? m.negated : !m.negated && (qualifies === null || qualifies[m.start])));
}

/** A sentence that is mostly 1–2 word comma-separated items: "Calm, dignity, respect, safety." */
export function isKeywordList(s: Sentence): boolean {
  return analyse(s, true).shape!.isList;
}

export type MatchOptions = {
  /** false for red flags: unsafe actions count however they're phrased. */
  strict?: boolean;
  /** Report every sentence a concept matches in, not just the first (to keep all red-flag sentences out of evidence). */
  everySentence?: boolean;
};

type Analysis = { stems: string[]; negated: boolean[]; shape?: SentenceShape };
const analyses = new WeakMap<Sentence, Analysis>();

function analyse(s: Sentence, withShape: boolean): Analysis {
  let a = analyses.get(s);
  if (!a) {
    a = { stems: s.tokens.map((t) => t.stem), negated: markNegated(s.tokens, s.raw) };
    analyses.set(s, a);
  }
  if (withShape && !a.shape) a.shape = shape(s, a.negated);
  return a;
}

/**
 * Concepts found in the text. Each concept counts once (the first sentence it qualifies in) and needs an
 * action verb in its clause. A keyword-list sentence contributes at most one concept.
 */
export function matchConcepts(sentences: Sentence[], concepts: Concept[], { strict = true, everySentence = false }: MatchOptions = {}): ConceptHit[] {
  const hit = new Set<string>();
  const out: ConceptHit[] = [];
  for (const s of sentences) {
    if (!everySentence && hit.size === concepts.length) break;
    const a = analyse(s, strict);
    const sh = strict ? a.shape : undefined;
    const { stems, negated } = a;
    const qualifies = sh ? sh.qualifies : null;
    const found = concepts.filter((c) => (everySentence || !hit.has(c.id)) && conceptCounts(c, stems, negated, qualifies));
    if (found.length === 0) continue;
    found.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    for (const c of sh?.isList ? found.slice(0, 1) : found) {
      hit.add(c.id);
      out.push({ conceptId: c.id, weight: c.weight, sentence: s.position });
    }
  }
  return out;
}
