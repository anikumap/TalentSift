import fs from "node:fs";
import path from "node:path";
import { TEMPLATES } from "@/providers/ai/templates";
import type { AIProvider, GradeInput, QuestionDraft } from "@/providers/types";

export const TAGS = ["strong", "average", "weak", "paraphrase", "negation", "unsafe", "stuffing", "vague", "short", "hinglish", "off-topic"] as const;

export type Entry = {
  id: string;
  split: "tune" | "holdout";
  questionIndex: number;
  answer: string;
  labels: Record<string, number>;
  tags: string[];
  safetySkill?: string;
};
export type FamilyFile = {
  family: string;
  scorecard?: { skills: { name: string; keywords: string[] }[]; questions: QuestionDraft[] };
  entries: Entry[];
};
export type Metrics = { n: number; withinOne: number; exact: number; spearman: number; unsafeOk: number; stuffingOk: number };
export type Filter = { split?: "tune" | "holdout"; generic?: boolean };

const DIR = path.join(import.meta.dirname, "answers");

export function loadBenchmark(): FamilyFile[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as FamilyFile);
}

function scorecardFor(file: FamilyFile): NonNullable<FamilyFile["scorecard"]> {
  if (file.scorecard) return file.scorecard;
  const t = TEMPLATES.find((x) => x.family === file.family);
  if (!t) throw new Error(`No template for benchmark family ${file.family}`);
  return { skills: t.skills.map((s) => ({ name: s.name, keywords: s.keywords })), questions: t.questions };
}

/** The full scorecard with this entry's answer in its question slot and the other answers empty. */
export function inputFor(file: FamilyFile, entry: Entry): GradeInput {
  const card = scorecardFor(file);
  return {
    skills: card.skills,
    questions: card.questions,
    answers: card.questions.map((_, i) => (i === entry.questionIndex ? entry.answer : "")),
  };
}

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation with average ranks for ties; 0 when either side is constant. */
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export type Row = { file: string; entry: Entry; skill: string; label: number; predicted: number };

export async function gradeAll(files: FamilyFile[], ai: AIProvider, filter: Filter): Promise<Row[]> {
  const rows: Row[] = [];
  for (const file of files) {
    const isGeneric = file.family === "generic";
    if (filter.generic !== undefined && filter.generic !== isGeneric) continue;
    for (const entry of file.entries) {
      if (filter.split && entry.split !== filter.split) continue;
      const grades = await ai.gradeAnswers(inputFor(file, entry));
      for (const [skill, label] of Object.entries(entry.labels)) {
        const predicted = grades.find((g) => g.skillName === skill)?.score ?? 0;
        rows.push({ file: file.family, entry, skill, label, predicted });
      }
    }
  }
  return rows;
}

export function metricsFor(rows: Row[]): Metrics {
  const n = rows.length;
  const frac = (k: number, d: number) => (d === 0 ? 1 : k / d);
  const unsafe = rows.filter((r) => r.entry.tags.includes("unsafe") && r.skill === r.entry.safetySkill);
  const stuffingEntries = new Map<string, Row[]>();
  for (const r of rows.filter((r) => r.entry.tags.includes("stuffing"))) {
    stuffingEntries.set(r.entry.id, [...(stuffingEntries.get(r.entry.id) ?? []), r]);
  }
  return {
    n,
    withinOne: frac(rows.filter((r) => Math.abs(r.label - r.predicted) <= 1).length, n),
    exact: frac(rows.filter((r) => r.label === r.predicted).length, n),
    spearman: n === 0 ? 0 : spearman(rows.map((r) => r.label), rows.map((r) => r.predicted)),
    unsafeOk: frac(unsafe.filter((r) => r.predicted <= 1).length, unsafe.length),
    stuffingOk: frac([...stuffingEntries.values()].filter((rs) => rs.every((r) => r.predicted <= 1)).length, stuffingEntries.size),
  };
}

export async function evaluate(files: FamilyFile[], ai: AIProvider, filter: Filter): Promise<Metrics> {
  return metricsFor(await gradeAll(files, ai, filter));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);

export function formatReport(rows: Record<string, Metrics>): string {
  const head = `${"set".padEnd(22)}${"n".padStart(5)}${"±1".padStart(8)}${"exact".padStart(8)}${"rho".padStart(7)}${"unsafe".padStart(8)}${"stuff".padStart(8)}`;
  const lines = Object.entries(rows).map(
    ([name, m]) => `${name.padEnd(22)}${String(m.n).padStart(5)} ${pct(m.withinOne)} ${pct(m.exact)}${m.spearman.toFixed(2).padStart(7)} ${pct(m.unsafeOk)} ${pct(m.stuffingOk)}`,
  );
  return [head, ...lines].join("\n");
}

/** Per-family and per-tag breakdown, for tuning. */
export function breakdown(rows: Row[]): Record<string, Metrics> {
  const out: Record<string, Metrics> = { all: metricsFor(rows) };
  for (const fam of [...new Set(rows.map((r) => r.file))]) out[`family:${fam}`] = metricsFor(rows.filter((r) => r.file === fam));
  for (const tag of TAGS) {
    const sub = rows.filter((r) => r.entry.tags.includes(tag));
    if (sub.length) out[`tag:${tag}`] = metricsFor(sub);
  }
  return out;
}
