import { ACTION_VERBS, AUXILIARIES } from "./lexicon";
import { normalizeText, type Token } from "./normalize";

export const NEGATORS = new Set([
  "not", "never", "no", "don't", "dont", "won't", "wont", "wouldn't", "wouldnt", "shouldn't", "shouldnt",
  "can't", "cant", "cannot", "didn't", "didnt", "doesn't", "doesnt", "isn't", "without", "avoid",
]);

/** Two-word negators: "rather than hiding it", "instead of covering it". */
const PAIRED_NEGATORS: Record<string, string> = { rather: "than", instead: "of" };

const MAX_SPAN = 6;
/** A new subject or "then" starts a new clause: "if she does not take it, I will tell her family". */
const CLAUSE_STARTERS = new Set(["i", "i'll", "i'd", "i'm", "we", "then"]);
/** "I don't think I should lift her" — the negation carries into the clause after think/believe. */
const OPINION_VERBS = new Set(["think", "believe", "feel", "suppose"]);
/** Hindi negators follow the verb: "pick up nahi karungi". */
const POSTVERBAL_NEGATORS = new Set(["nahi", "nahin", "mat"]);
const POSTVERBAL_SPAN = 3;
const PRONOUNS = new Set(["i", "i'll", "i'd", "she", "he", "we", "they", "you", "it"]);
const SAY = new Set(["say", "says", "said", "saying", "answer", "answers", "reply", "replies", "refuse", "refuses"]);

/** "she says no" or "no, I call…" is an answer or interjection, not negation. */
function isInterjectedNo(tokens: Token[], i: number, breaks: Set<number>): boolean {
  if (tokens[i].text !== "no") return false;
  return breaks.has(i) || SAY.has(tokens[i - 1]?.text ?? "") || PRONOUNS.has(tokens[i + 1]?.text ?? "") || i === tokens.length - 1;
}

/** Token indexes that are followed by a comma/semicolon/colon in the sentence. */
export function clauseBreaks(raw: string): Set<number> {
  const breaks = new Set<number>();
  let idx = -1;
  for (const m of normalizeText(raw).matchAll(/[a-z0-9']+|[,;:]/g)) {
    if (/^[,;:]$/.test(m[0])) {
      if (idx >= 0) breaks.add(idx);
    } else if (m[0].replace(/^'+|'+$/g, "")) idx++;
  }
  return breaks;
}

function isAction(t: Token | undefined): boolean {
  return !!t && ACTION_VERBS.has(t.stem) && !AUXILIARIES.has(t.stem);
}

/** true for each token inside a negation span; negators themselves are false. */
export function markNegated(tokens: Token[], raw: string): boolean[] {
  const marks = tokens.map(() => false);
  const breaks = clauseBreaks(raw);
  for (let i = 0; i < tokens.length; i++) {
    if (POSTVERBAL_NEGATORS.has(tokens[i].text)) {
      for (let j = i - 1, n = 0; j >= 0 && n < POSTVERBAL_SPAN && !breaks.has(j); j--, n++) marks[j] = true;
      continue;
    }
    const second = PAIRED_NEGATORS[tokens[i].text];
    const paired = second !== undefined && tokens[i + 1]?.text === second;
    if (!paired && !NEGATORS.has(tokens[i].text)) continue;
    if (breaks.has(i) || isInterjectedNo(tokens, i, breaks)) continue;
    for (let j = i + (paired ? 2 : 1), n = 0; j < tokens.length && n < MAX_SPAN; j++, n++) {
      const t = tokens[j].text;
      if (t === "but" || NEGATORS.has(t)) break;
      if (CLAUSE_STARTERS.has(t) && !OPINION_VERBS.has(tokens[j - 1]?.text ?? "")) break;
      if ((t === "and" || t === "or") && (tokens[j + 1]?.text === "then" || isAction(tokens[j + 1]))) break;
      marks[j] = true;
      if (breaks.has(j)) break;
    }
  }
  return marks;
}
