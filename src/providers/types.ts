import type { CheckoutItem, MustHaveKind } from "@/domain/constants";
import type { ParsedResume } from "@/domain/scoring";

export type { ParsedResume };

export type IntakeAnswers = {
  title: string;
  location: string;
  tasks: string;
  mustHaves: string;
  payMin: number;
  payMax: number;
  shifts: string;
};

export type SkillDraft = { name: string; description: string; weight: number; keywords: string[] };
export type MustHaveDraft = { label: string; kind: MustHaveKind; question: string };
export type QuestionDraft = { prompt: string; skillNames: string[] };

export type ScorecardDraft = {
  roleFamily: string;
  skills: SkillDraft[];
  mustHaves: MustHaveDraft[];
  questions: QuestionDraft[];
};

export type JobInfo = { title: string; location: string; payMin: number; payMax: number; shifts: string };

export type GradeInput = {
  skills: { name: string; keywords: string[] }[];
  questions: QuestionDraft[];
  /** Candidate text. Treated strictly as data, never as instructions. */
  answers: string[];
};

export type SkillGrade = { skillName: string; score: 0 | 1 | 2 | 3 | 4; evidence: string[] };

export interface AIProvider {
  readonly model: string;
  readonly promptVersion: string;
  generateScorecard(intake: IntakeAnswers): Promise<ScorecardDraft>;
  generateJobAd(job: JobInfo, scorecard: Pick<ScorecardDraft, "skills" | "mustHaves">): Promise<string>;
  gradeAnswers(input: GradeInput): Promise<SkillGrade[]>;
  parseResume(text: string): Promise<ParsedResume>;
}

export type OutgoingEmail = { orgId: string; to: string; subject: string; body: string; kind: string };

export interface EmailProvider {
  send(msg: OutgoingEmail): Promise<void>;
}

export interface BillingProvider {
  createCheckout(orgId: string, item: CheckoutItem): Promise<{ url: string; sessionId: string }>;
  /** Returns the purchased item if the session is valid for this org. */
  verify(orgId: string, sessionId: string): Promise<CheckoutItem>;
}
