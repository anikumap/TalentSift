import { gradeSkill, redFlagSentences, type Rubric } from "@/domain/grading/grade";
import { selectRubrics } from "@/domain/grading/rubrics";
import type { GradeInput, SkillGrade } from "../types";
import { MockAIProvider } from "./mock";

const MAX_ANSWER_CHARS = 4000;

/**
 * Grades work-sample answers with deterministic concept rubrics (src/domain/grading) — no API calls.
 * Scorecard, job ad and resume generation are inherited from the mock.
 */
export class RuleBasedAIProvider extends MockAIProvider {
  readonly model: string = "rules";
  readonly promptVersion: string = "rules-v1";

  async gradeAnswers(input: GradeInput): Promise<SkillGrade[]> {
    const rubrics = selectRubrics(input.skills);
    const answers = input.questions.map((_, i) => (input.answers[i] ?? "").slice(0, MAX_ANSWER_CHARS));
    // A sentence any linked skill flags as unsafe is never quoted as evidence for another skill either.
    const unsafe = new Set(
      input.questions.flatMap((q, i) => [...redFlagSentences(answers[i], q.skillNames.map((n) => rubrics.get(n)).filter((r): r is Rubric => !!r))]),
    );
    return input.skills.map((skill) => {
      const text = input.questions
        .map((q, i) => (q.skillNames.includes(skill.name) ? answers[i] : ""))
        .filter(Boolean)
        .join("\n");
      const { score, evidence } = gradeSkill(text, rubrics.get(skill.name)!, { excludeEvidence: unsafe });
      return { skillName: skill.name, score, evidence };
    });
  }
}
