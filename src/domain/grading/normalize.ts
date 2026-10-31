export type Token = { text: string; stem: string };
export type Sentence = { raw: string; tokens: Token[]; position: number };

const IRREGULAR: Record<string, string> = {
  told: "tell",
  gave: "give",
  given: "give",
  kept: "keep",
  took: "take",
  taken: "take",
  brought: "bring",
  went: "go",
  gone: "go",
  spoke: "speak",
  bought: "buy",
  felt: "feel",
  left: "leave",
  came: "come",
  ran: "run",
  drove: "drive",
  driven: "drive",
  fell: "fall",
  fallen: "fall",
  paid: "pay",
  said: "say",
  sent: "send",
  found: "find",
  knew: "know",
  wrote: "write",
  written: "write",
  hurt: "hurt",
  children: "child",
  women: "woman",
  men: "man",
  people: "person",
};

const SPELLING: Record<string, string> = {
  organise: "organize",
  organised: "organized",
  organising: "organizing",
  prioritise: "prioritize",
  prioritised: "prioritized",
  apologise: "apologize",
  apologised: "apologized",
  apologising: "apologizing",
  colour: "color",
  behaviour: "behavior",
  licence: "license",
  centre: "center",
  realise: "realize",
  recognise: "recognize",
  tyre: "tire",
  cheque: "check",
};

/** Indian English / Hinglish phrasing mapped to plain forms. Applied after lowercasing. */
const PHRASE_MAP: [RegExp, string][] = [
  [/\b(doctor|dr) (sahab|saab|sir|madam|ji)\b/g, "doctor"],
  [/\b(in-charge|in charge|incharge|madam|ma'am|maam|sir|boss|sahab|saab|seth|malik)\b/g, "supervisor"],
  [/\b(tell|inform|report|explain|say) to\b/g, "$1"],
  [/\bji\b/g, ""],
  [/\bmobile\b/g, "phone"],
  [/\bcustomer care\b/g, "helpline"],
];

const DOUBLE_COLLAPSE = /([bdgmnprt])\1$/;

export function stem(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3 || /\d/.test(w)) return w;
  let s = w;
  let viaVerbSuffix = false;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("ied") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("ing") && s.length - 3 >= 2) {
    s = s.slice(0, -3);
    viaVerbSuffix = true;
  } else if (s.endsWith("ed") && s.length - 2 >= 2) {
    s = s.slice(0, -2);
    viaVerbSuffix = true;
  } else if (s.endsWith("es") && /(s|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  else if (s.endsWith("ly") && s.length - 2 >= 3) s = s.slice(0, -2);

  if (viaVerbSuffix) {
    if (DOUBLE_COLLAPSE.test(s)) return s.slice(0, -1);
    // Restore a dropped final "e" (moving → move, taking → take, noted → note).
    if (/v$/.test(s) || /ic$/.test(s) || (s.length <= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(s))) return s + "e";
    if (/[^aeiou][aeiou][kz]$/.test(s) && s.length <= 4) return s + "e";
  }
  return s;
}

export function normalizeText(text: string): string {
  let t = text.toLowerCase().replace(/[’‘`´]/g, "'");
  t = t.replace(/[a-z]+/g, (w) => SPELLING[w] ?? w);
  for (const [re, to] of PHRASE_MAP) t = t.replace(re, to);
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

export function tokenize(text: string): Token[] {
  return (normalizeText(text).match(/[a-z0-9']+/g) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((w) => ({ text: w, stem: stem(w) }));
}

export function splitSentences(text: string): Sentence[] {
  const raws = (text.match(/[^.!?\n]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
  const out: Sentence[] = [];
  for (const raw of raws) {
    const tokens = tokenize(raw);
    if (tokens.length === 0) continue;
    out.push({ raw, tokens, position: out.length });
  }
  return out;
}
