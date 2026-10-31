import { describe, it, expect } from "vitest";
import { gradeSkill, type Rubric } from "@/domain/grading/grade";
import { matchConcepts, type Concept } from "@/domain/grading/concepts";
import { FAMILY_RUBRICS, selectRubrics } from "@/domain/grading/rubrics";
import { expand } from "@/domain/grading/lexicon";
import { markNegated } from "@/domain/grading/negation";
import { splitSentences } from "@/domain/grading/normalize";
import { RuleBasedAIProvider } from "@/providers/ai/rule-based";
import { TEMPLATES } from "@/providers/ai/templates";

const rub = (fam: string, name: string) => FAMILY_RUBRICS[fam].find((r) => r.skillName === name)!;
const g = (fam: string, name: string, text: string) => gradeSkill(text, rub(fam, name));
const neg = (t: string) => {
  const [s] = splitSentences(t);
  const m = markNegated(s.tokens, s.raw);
  return s.tokens.filter((_, i) => m[i]).map((x) => x.text);
};
const fires = (text: string, c: Concept, strict = true) => matchConcepts(splitSentences(text), [c], { strict }).length > 0;

describe("C1: rubric phrases containing a negator still match", () => {
  it("credits avoiding flooded roads and riding slowly", () => {
    expect(g("driver", "Safe driving", "I will avoid the flooded roads and ride slowly.").score).toBeGreaterThanOrEqual(2);
  });

  it("fires red flags that start with not / no", () => {
    expect(g("warehouse", "Reliability", "Not my problem, shift is over. I will finish and tell the supervisor.").trace.redFlags).toContain("leave-early");
    expect(g("retail", "Customer service", "I calmly listen and say sorry, but no return, policy is policy. I will tell the manager.").score).toBeLessThanOrEqual(1);
  });

  it("credits concepts that contain no / don't / without", () => {
    expect(g("warehouse", "Safety awareness", "I make sure no one walks under the rack and tell the supervisor.").trace.concepts).toContain("keep-away");
  });

  it("every rubric term fires on itself in a plain sentence", () => {
    const misses: string[] = [];
    for (const [fam, rubrics] of Object.entries(FAMILY_RUBRICS)) {
      for (const r of rubrics) {
        for (const c of r.concepts) {
          for (const p of c.patterns) {
            const samples = "any" in p ? p.any.map((w) => expand(w)[0]) : "phrase" in p ? [p.phrase] : [`${expand(p.pair[0][0])[0]} ${expand(p.pair[1][0])[0]}`];
            for (const t of samples) {
              const text = c.invertsUnderNegation ? `I would never ${t} today.` : `I check ${t} today.`;
              if (!fires(text, c)) misses.push(`${fam}/${r.skillName}/${c.id}: "${t}"`);
            }
          }
        }
        for (const f of r.redFlags) {
          for (const p of f.patterns) {
            const samples = "any" in p ? p.any.map((w) => expand(w)[0]) : "phrase" in p ? [p.phrase] : [`${expand(p.pair[0][0])[0]} ${expand(p.pair[1][0])[0]}`];
            for (const t of samples) if (!fires(`I ${t} today.`, f, false)) misses.push(`${fam}/${r.skillName}/flag ${f.id}: "${t}"`);
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });
});

describe("C2: recruiter keywords are data", () => {
  it("does not crash on a keyword starting with @", async () => {
    const ai = new RuleBasedAIProvider();
    const g2 = await ai.gradeAnswers({
      skills: [{ name: "Home visits", keywords: ["@home", "visit"] }],
      questions: [{ prompt: "q", skillNames: ["Home visits"] }],
      answers: ["I visit the home on time and check the client."],
    });
    expect(g2[0].score).toBeGreaterThan(0);
  });
});

describe("C3: benign phrasing does not trip red flags", () => {
  it.each([
    ["caregiver", "Handling emergencies", "I pick up the phone and call 108, then check she is breathing and keep her warm with a blanket."],
    ["caregiver", "Reliability", "I wait with the client for the relief carer. Before I leave I hand over everything that happened and write it in the logbook."],
    ["caregiver", "Reliability", "I stay with her and call the agency supervisor. I will leave a note in the diary and do a proper handover."],
    ["warehouse", "Accuracy in picking & packing", "I keep the box aside, scan the barcode again and compare with the order sheet. I tell the supervisor anyway."],
    ["warehouse", "Accuracy in picking & packing", "I pick the correct item from the rack, scan it and pack it."],
    ["retail", "Cash handling & billing", "I check the bill and see whether the warranty will cover it."],
    ["caregiver", "Patient care & dignity", "If she is stubborn I stay calm and ask her gently why she does not want it."],
  ])("%s / %s: %s", (fam, skill, text) => {
    expect(g(fam, skill, text).trace.redFlags).toEqual([]);
  });

  it.each([
    ["warehouse", "Accuracy in picking & packing", "I will pack it anyway and send it."],
    ["caregiver", "Reliability", "My shift is over so I will leave at the time."],
    ["caregiver", "Handling emergencies", "I will lift her up and put her on the bed."],
    ["caregiver", "Patient care & dignity", "Old people are stubborn, you have to be strict and put the tablet in her mouth."],
  ])("still flags %s / %s: %s", (fam, skill, text) => {
    expect(g(fam, skill, text).trace.redFlags.length).toBeGreaterThan(0);
  });
});

describe("I1: repeated short answers", () => {
  it("does not raise a score by pasting a short answer many times", () => {
    const once = g("caregiver", "Handling emergencies", "Call 108 now.").score;
    expect(g("caregiver", "Handling emergencies", "Call 108 now. ".repeat(10)).score).toBe(once);
  });
});

describe("I2: copula keyword stuffing", () => {
  it("does not let 'X is important' sentences pass as actions", () => {
    expect(g("caregiver", "Patient care & dignity", "Calm is important. Dignity is important. Respect is important. Comfort is important. Explaining is important.").score).toBeLessThanOrEqual(1);
    expect(g("warehouse", "Safety awareness", "Forklift is needed. Cones are needed. Gloves are needed. Supervisor is told. Stop is needed. Stable is checked.").score).toBeLessThanOrEqual(1);
  });
});

describe("I3: unsafe sentences are never quoted for any skill", () => {
  it("keeps an unsafe sentence out of every skill's evidence for that answer", async () => {
    const ai = new RuleBasedAIProvider();
    const t = TEMPLATES.find((x) => x.family === "caregiver")!;
    const answers = ["", "I lift her up and put her on the bed and hold her hand gently to comfort her and stay calm.", ""];
    const grades = await ai.gradeAnswers({ skills: t.skills, questions: t.questions, answers });
    for (const gr of grades) expect(gr.evidence.join(" "), gr.skillName).not.toMatch(/lift her up/);
  });
});

describe("I4: negation stops at 'and' + a new action", () => {
  it("does not negate the second action", () => {
    expect(neg("I will not move her and call 108 at once")).toEqual(["move", "her"]);
  });

  it("flags 'not panic and lift her'", () => {
    const r = g("caregiver", "Handling emergencies", "I will not panic and lift her up onto the bed.");
    expect(r.trace.redFlags).toContain("move-injured");
    expect(r.trace.concepts).not.toContain("no-move");
  });
});

describe("I5: more negation forms", () => {
  it("handles don't think I should", () => {
    expect(neg("I don't think I should lift her up")).toContain("lift");
  });

  it("handles post-verbal nahi", () => {
    expect(neg("Main unko pick up nahi karungi")).toEqual(["unko", "pick", "up"]);
  });
});

describe("I6: renamed skills keep safety rubrics", () => {
  const cg = TEMPLATES.find((x) => x.family === "caregiver")!.skills;
  const em = rub("caregiver", "Handling emergencies");

  it("uses the family with the most matches when at least two names match", () => {
    const renamed = cg.map((s, i) => (i < 3 && s.name !== "Handling emergencies" ? { ...s, name: `Custom ${i}` } : s));
    expect(selectRubrics(renamed).get("Handling emergencies")).toBe(em);
  });

  it("keeps a uniquely named safety rubric even when it's the only match", () => {
    const one = cg.map((s) => (s.name === "Handling emergencies" ? s : { ...s, name: `Custom ${s.name.length}` }));
    expect(selectRubrics(one).get("Handling emergencies")).toBe(em as Rubric);
  });
});
