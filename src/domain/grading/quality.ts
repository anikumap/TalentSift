import { ACTION_VERBS, AUXILIARIES, FILLER_PHRASES, SEQUENCE_MARKERS } from "./lexicon";
import { normalizeText, tokenize, type Sentence } from "./normalize";

export type QualityParts = Record<"steps" | "concrete" | "ownership" | "filler" | "short", number>;

const QUANTITY_WORDS = /\b(minutes?|mins?|hours?|hrs?|seconds?|am|pm|rupees?|rs|inr|boxes|items?|pieces?|times?|days?|km|kms|metres?|meters?)\b|₹/;
const SHORT_WORDS = 8;
const FILLER_RES = FILLER_PHRASES.map((f) => new RegExp(`\\b${f}\\b`));
const SEQUENCE_RES = SEQUENCE_MARKERS.map((m) => new RegExp(`\\b${m}\\b`));

function countSequenceMarkers(normalized: string): number {
  return SEQUENCE_RES.filter((re) => re.test(normalized)).length;
}

/** Answer-wide signals of a well-reasoned response, independent of the skill. Total is clamped to [-1, 1]. */
export function qualityModifier(text: string, sentences: Sentence[], conceptSentences: ReadonlySet<number>): { total: number; parts: QualityParts } {
  const normalized = normalizeText(text);
  const tokens = tokenize(text);
  const parts: QualityParts = { steps: 0, concrete: 0, ownership: 0, filler: 0, short: 0 };

  const listMarkers = text.match(/(^|\s)\d+[.)](?=\s)/g)?.length ?? 0;
  if (countSequenceMarkers(normalized) >= 2 || listMarkers >= 2) parts.steps = 0.5;

  const verbs = new Set(tokens.map((t) => t.stem).filter((s) => ACTION_VERBS.has(s) && !AUXILIARIES.has(s)));
  const hasNumber = tokens.some((t) => /\d/.test(t.text));
  if (hasNumber || QUANTITY_WORDS.test(normalized) || verbs.size >= 2) parts.concrete = 0.5;

  if (tokens.some((t) => t.text === "i" || t.text === "i'd" || t.text === "i'll" || t.text === "i'm")) parts.ownership = 0.25;

  const fillerOutsideConcepts = sentences.some(
    (s) => !conceptSentences.has(s.position) && FILLER_RES.some((re) => re.test(s.tokens.map((t) => t.text).join(" "))),
  );
  if (fillerOutsideConcepts) parts.filler = -0.5;

  if (tokens.length < SHORT_WORDS) parts.short = -1;

  // A very short answer can't earn back its penalty with structure bonuses.
  if (parts.short < 0) return { total: -1, parts };
  const sum = parts.steps + parts.concrete + parts.ownership + parts.filler;
  return { total: Math.max(-1, Math.min(1, sum)), parts };
}
