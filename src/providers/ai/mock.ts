import { normalizeWeights } from "@/domain/scoring";
import { formatINR } from "@/domain/billing";
import type {
  AIProvider,
  GradeInput,
  IntakeAnswers,
  JobInfo,
  MustHaveDraft,
  ParsedResume,
  ScorecardDraft,
  SkillGrade,
} from "../types";
import { TEMPLATES } from "./templates";

const STOPWORDS = new Set(["and", "the", "with", "for", "to", "of", "a", "an", "on", "in", "at", "do", "be", "from"]);

function splitList(text: string): string[] {
  return text
    .split(/[,\n;]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Keyword present as a word or word-start (so "medicine" matches "medicines"). */
function hasKeyword(sentence: string, keyword: string): boolean {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(sentence.toLowerCase());
}

function mustHavesFromText(text: string): MustHaveDraft[] {
  return splitList(text).map((label) => {
    const kind = /licen[cs]e|certif|permit/i.test(label)
      ? "LICENSE"
      : /weekend|night|shift|availab|morning|evening|holiday/i.test(label)
        ? "AVAILABILITY"
        : /pay|salary|wage/i.test(label)
          ? "PAY"
          : "OTHER";
    return { label: capitalize(label), kind, question: `Do you meet this requirement: ${label}?` } as MustHaveDraft;
  });
}

/** Deterministic stand-in for Claude. Same input always gives the same output. */
export class MockAIProvider implements AIProvider {
  readonly model = "mock-ai";
  readonly promptVersion = "mock-v1";

  async generateScorecard(intake: IntakeAnswers): Promise<ScorecardDraft> {
    const template = TEMPLATES.find((t) => t.match.test(intake.title));
    const typed = mustHavesFromText(intake.mustHaves);

    if (template) {
      const existing = new Set(template.mustHaves.map((m) => m.label.toLowerCase()));
      return {
        roleFamily: template.family,
        skills: template.skills.map((s) => ({ ...s, keywords: [...s.keywords] })),
        mustHaves: [...template.mustHaves, ...typed.filter((m) => !existing.has(m.label.toLowerCase()))],
        questions: template.questions.map((q) => ({ ...q, skillNames: [...q.skillNames] })),
      };
    }

    const unique = [...new Set(splitList(intake.tasks).map((t) => capitalize(t.toLowerCase())))].slice(0, 6);
    for (const filler of ["Communication", "Reliability", "Problem solving"]) {
      if (unique.length >= 3) break;
      if (!unique.includes(filler)) unique.push(filler);
    }
    const weights = normalizeWeights(unique.map(() => 1));
    const skills = unique.map((name, i) => ({
      name,
      description: `Can ${name.toLowerCase()} well and safely.`,
      weight: weights[i],
      keywords: name
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    }));
    return {
      roleFamily: "general",
      skills,
      mustHaves: typed.length ? typed : [{ label: "Can work the listed shifts", kind: "AVAILABILITY", question: "Can you work the shifts listed for this job?" }],
      questions: [
        { prompt: `Tell us about a time you had to ${skills[0].name.toLowerCase()}. What did you do and what happened?`, skillNames: [skills[0].name] },
        { prompt: `Describe how you would ${skills[1].name.toLowerCase()} on a very busy day.`, skillNames: [skills[1].name] },
        { prompt: `Something goes wrong while you ${skills[2].name.toLowerCase()}. Walk us through how you handle it.`, skillNames: skills.slice(2).map((s) => s.name) },
      ],
    };
  }

  async generateJobAd(job: JobInfo, card: Pick<ScorecardDraft, "skills" | "mustHaves">): Promise<string> {
    const pay = `${formatINR(job.payMin * 100)}–${formatINR(job.payMax * 100)} per month`;
    return [
      `${job.title} — ${job.location}`,
      "",
      `We're hiring a ${job.title} to join our team in ${job.location}. Pay is ${pay}. Shifts: ${job.shifts}.`,
      "",
      "What you'll do:",
      ...card.skills.map((s) => `• ${s.description}`),
      "",
      "What you need:",
      ...card.mustHaves.map((m) => `• ${m.label}`),
      "",
      "How to apply: it takes about 2 minutes on your phone. No account and no resume needed — you'll answer three short questions about real situations from the job. We review every answer and reply to everyone.",
    ].join("\n");
  }

  async gradeAnswers(input: GradeInput): Promise<SkillGrade[]> {
    return input.skills.map((skill) => {
      const relevant = input.questions
        .map((q, i) => (q.skillNames.includes(skill.name) ? input.answers[i] ?? "" : ""))
        .join("\n");
      const scored = sentences(relevant).map((s, order) => ({
        s,
        order,
        hits: skill.keywords.filter((k) => hasKeyword(s, k)),
      }));
      const distinct = new Set(scored.flatMap((x) => x.hits));
      const evidence = scored
        .filter((x) => x.hits.length > 0)
        .sort((a, b) => b.hits.length - a.hits.length || a.order - b.order)
        .slice(0, 2)
        .map((x) => x.s);
      return { skillName: skill.name, score: Math.min(4, distinct.size) as SkillGrade["score"], evidence };
    });
  }

  async parseResume(text: string): Promise<ParsedResume> {
    const years = [...text.matchAll(/(\d{1,2})(?:\.\d)?\+?\s*(?:years?|yrs?)/gi)].map((m) => Number(m[1]));
    const certs = new Set<string>();
    const CERT_WORDS = ["CPR", "First Aid", "GDA", "BLS", "Forklift", "Driving Licence", "Driving License", "HMV", "LMV", "Nursing"];
    for (const c of CERT_WORDS) if (new RegExp(`\\b${c}\\b`, "i").test(text)) certs.add(c);
    const titles = new Set<string>();
    for (const m of text.matchAll(/\b(?:as an?|as)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g)) titles.add(m[1]);
    return { certifications: [...certs], yearsExperience: years.length ? Math.max(...years) : 0, titles: [...titles] };
  }
}
