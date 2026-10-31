import { describe, it, expect } from "vitest";
import { gradeSkill, type Rubric } from "@/domain/grading/grade";

const R: Rubric = {
  skillName: "Patient care & dignity",
  concepts: [
    { id: "calm", weight: 1, patterns: [{ any: ["@calm"] }] },
    { id: "escalate", weight: 2, patterns: [{ pair: [["@inform"], ["supervisor", "daughter", "family"]] }] },
    { id: "explain", weight: 1, patterns: [{ any: ["explain"] }] },
    { id: "no-force", weight: 2, patterns: [{ any: ["force"] }], invertsUnderNegation: true },
  ],
  redFlags: [{ id: "force-med", weight: 1, patterns: [{ pair: [["force"], ["medicine", "tablet", "mouth"]] }] }],
  strongWeight: 4,
};

describe("gradeSkill", () => {
  it("scores empty and tiny answers 0 with no evidence", () => {
    expect(gradeSkill("", R).score).toBe(0);
    expect(gradeSkill("ok", R)).toMatchObject({ score: 0, evidence: [] });
  });

  it("scores non-Latin script 0 without throwing", () => {
    expect(gradeSkill("मैं डॉक्टर को बुलाऊंगी और परिवार को बताऊंगी", R)).toMatchObject({ score: 0, evidence: [] });
  });

  it("gives a complete, ordered answer 4 with two evidence quotes", () => {
    const strong = "First I stay calm and explain why the medicine matters. I would never force her. Then I call her daughter and tell the supervisor.";
    const g = gradeSkill(strong, R);
    expect(g.score).toBe(4);
    expect(g.evidence).toHaveLength(2);
  });

  it("caps unsafe answers at 1 and never quotes the unsafe sentence", () => {
    const unsafe = "I stay calm and explain, then I force the medicine into her mouth and tell the supervisor later.";
    const g = gradeSkill(unsafe, R);
    expect(g.score).toBeLessThanOrEqual(1);
    expect(g.evidence.join(" ")).not.toMatch(/force the medicine/);
    expect(g.trace.redFlags).toEqual(["force-med"]);
  });

  it("fires a red flag even without another action verb", () => {
    expect(gradeSkill("Just force the tablet into her mouth quickly before she spits it.", R).trace.redFlags).toEqual(["force-med"]);
  });

  it("does not fire a negated red flag", () => {
    expect(gradeSkill("I would never force the medicine, I stay calm and explain gently to her.", R).trace.redFlags).toEqual([]);
  });

  it("gives vague on-topic filler a 1", () => {
    expect(gradeSkill("I will handle the situation properly and do whatever is needed.", R).score).toBe(1);
  });

  it("gives an off-topic answer 0", () => {
    expect(gradeSkill("I have worked five years in Pune and I am very hardworking.", R).score).toBe(0);
  });

  it("gives a short answer that names a right idea a 1", () => {
    expect(gradeSkill("Explain it gently.", R).score).toBe(1);
  });

  it("gives a keyword list that names the skill's ideas a 1", () => {
    expect(gradeSkill("Calm, gently, kindly, patience.", R).score).toBe(1);
  });

  it("gives 0 to an unsafe answer with little else", () => {
    expect(gradeSkill("Just force the tablet into her mouth quickly before she spits it.", R).score).toBe(0);
  });

  it("caps a keyword-list answer at 1", () => {
    expect(gradeSkill("Calm, explain, gently, tell supervisor, never force, kindly.", R).score).toBeLessThanOrEqual(1);
  });

  it("does not inflate a repeated sentence", () => {
    const once = "I stay calm with her and talk to her. ";
    expect(gradeSkill(once.repeat(20), R).score).toBe(gradeSkill(once, R).score);
  });

  it("handles one long run-on message and truncates long evidence", () => {
    const blob =
      "i stay calm and explain to her slowly why the tablet is needed and i would never force her and if she still says no i call her daughter and also tell the supervisor and note the time in the chart so the next shift knows what happened and nobody is confused later in the evening when the doctor comes to visit her again";
    const g = gradeSkill(blob, R);
    expect(g.trace.concepts).toHaveLength(4);
    expect(g.evidence[0].length).toBeLessThanOrEqual(241);
  });
});
