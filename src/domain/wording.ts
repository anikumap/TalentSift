export type WordingFlag = { phrase: string; reason: string; suggestion: string; index: number };
export type WordingContext = { skillNames: string[]; hourly: boolean };

type Rule = {
  pattern: RegExp;
  reason: string;
  suggestion: string | ((match: string) => string);
  when?: (ctx: WordingContext) => boolean;
};

const AGE = "Age-coded wording can discourage older applicants and may breach equal-opportunity rules.";
const GENDER = "Gendered wording discourages some applicants. Use a neutral term.";
const JARGON = "Jargon sounds exclusive and tells candidates nothing about the job.";

const hasPhysicalSkill = (ctx: WordingContext) =>
  ctx.skillNames.some((n) => /lift|physical|manual|load/i.test(n));

const RULES: Rule[] = [
  { pattern: /\b(young|youthful)\b/gi, reason: AGE, suggestion: "motivated" },
  { pattern: /\b(digital natives?|recent graduates? only)\b/gi, reason: AGE, suggestion: "comfortable with apps" },
  { pattern: /\b(salesman|salesmen)\b/gi, reason: GENDER, suggestion: (m) => (m.toLowerCase().endsWith("men") ? "salespeople" : "salesperson") },
  { pattern: /\b(deliveryman|deliverymen)\b/gi, reason: GENDER, suggestion: "delivery driver" },
  { pattern: /\b(waitress|waiter)\b/gi, reason: GENDER, suggestion: "server" },
  { pattern: /\b(manpower)\b/gi, reason: GENDER, suggestion: "staff" },
  { pattern: /\b(he|she) (will|must|should)\b/gi, reason: GENDER, suggestion: (m) => "you " + m.split(" ")[1] },
  { pattern: /\b(rockstars?|ninjas?|gurus?|superstars?)\b/gi, reason: JARGON, suggestion: "skilled" },
  {
    pattern: /\bnative (english|hindi|tamil|kannada|marathi|telugu|bengali) speakers?\b/gi,
    reason: "\"Native speaker\" can exclude people by national origin. Ask for the fluency the job needs.",
    suggestion: (m) => `fluent in ${m.split(" ")[1][0].toUpperCase()}${m.split(" ")[1].slice(1).toLowerCase()}`,
  },
  {
    pattern: /\b(bachelor'?s|master'?s|graduate) degree (is )?(required|mandatory|must)\b/gi,
    reason: "Degree requirements usually aren't needed for hourly roles and shrink your applicant pool.",
    suggestion: "relevant experience welcome",
    when: (ctx) => ctx.hourly,
  },
  {
    pattern: /\blift(ing)? (up to )?\d+\s?(kg|kgs|kilos|lbs?|pounds)\b/gi,
    reason: "A physical requirement with no matching scorecard skill may exclude people unnecessarily.",
    suggestion: "handle items safely (with support where needed)",
    when: (ctx) => !hasPhysicalSkill(ctx),
  },
];

export function checkWording(text: string, ctx: WordingContext): WordingFlag[] {
  const flags: WordingFlag[] = [];
  for (const rule of RULES) {
    if (rule.when && !rule.when(ctx)) continue;
    for (const m of text.matchAll(rule.pattern)) {
      const phrase = m[0];
      const suggestion = typeof rule.suggestion === "function" ? rule.suggestion(phrase) : rule.suggestion;
      flags.push({ phrase, reason: rule.reason, suggestion, index: m.index ?? 0 });
    }
  }
  return flags.sort((a, b) => a.index - b.index);
}

export function applySuggestion(text: string, flag: WordingFlag): string {
  if (text.slice(flag.index, flag.index + flag.phrase.length) !== flag.phrase) return text;
  return text.slice(0, flag.index) + flag.suggestion + text.slice(flag.index + flag.phrase.length);
}
