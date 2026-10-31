import { describe, it, expect } from "vitest";
import { RuleBasedAIProvider } from "@/providers/ai/rule-based";
import { getProviders } from "@/lib/providers";

const ai = new RuleBasedAIProvider();
const card = () => ai.generateScorecard({ title: "Home Caregiver", location: "Pune", tasks: "", mustHaves: "", payMin: 1, payMax: 2, shifts: "day" });

describe("RuleBasedAIProvider", () => {
  it("identifies itself in the audit trail", () => {
    expect(ai.model).toBe("rules");
    expect(ai.promptVersion).toBe("rules-v1");
  });

  it("returns one plain SkillGrade per skill, in order", async () => {
    const c = await card();
    const g = await ai.gradeAnswers({ skills: c.skills, questions: c.questions, answers: ["I stay calm and explain the medicine, then tell her daughter.", "", ""] });
    expect(g.map((x) => x.skillName)).toEqual(c.skills.map((s) => s.name));
    expect(Object.keys(g[0]).sort()).toEqual(["evidence", "score", "skillName"]);
  });

  it("scores 0 for a skill whose only linked answer is empty", async () => {
    const c = await card();
    const g = await ai.gradeAnswers({ skills: c.skills, questions: c.questions, answers: ["I stay calm and explain the medicine, then tell her daughter.", "", ""] });
    expect(g.find((x) => x.skillName === "Handling emergencies")!.score).toBe(0);
  });

  it("scores 0 for a skill no question links to", async () => {
    const g = await ai.gradeAnswers({ skills: [{ name: "Orphan", keywords: ["calm"] }], questions: [], answers: [] });
    expect(g).toEqual([{ skillName: "Orphan", score: 0, evidence: [] }]);
  });

  it("grades very long answers quickly", async () => {
    const c = await card();
    const long = "I stay calm and tell the nurse. ".repeat(1000);
    const t0 = performance.now();
    await ai.gradeAnswers({ skills: c.skills, questions: c.questions, answers: [long, long, long] });
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("is the default AI provider", () => {
    expect(getProviders().ai).toBeInstanceOf(RuleBasedAIProvider);
  });
});
