import { describe, it, expect } from "vitest";
import { FAMILY_RUBRICS, selectRubrics } from "@/domain/grading/rubrics";
import { WAREHOUSE_RUBRICS } from "@/domain/grading/rubrics/warehouse";
import { gradeSkill } from "@/domain/grading/grade";
import { expand } from "@/domain/grading/lexicon";
import { TEMPLATES } from "@/providers/ai/templates";

describe("family rubrics", () => {
  it("cover every template skill exactly", () => {
    for (const t of TEMPLATES) {
      expect(FAMILY_RUBRICS[t.family].map((r) => r.skillName).sort(), t.family).toEqual(t.skills.map((s) => s.name).sort());
    }
  });

  it("set strongWeight between 50% and 70% of total weight", () => {
    for (const rs of Object.values(FAMILY_RUBRICS)) {
      for (const r of rs) {
        const total = r.concepts.reduce((a, c) => a + c.weight, 0);
        expect(r.strongWeight, r.skillName).toBeGreaterThan(0.5 * total);
        expect(r.strongWeight, r.skillName).toBeLessThan(0.7 * total);
      }
    }
  });

  it("give every safety-relevant skill red flags", () => {
    const safety = ["Handling emergencies", "Patient care & dignity", "Safety awareness", "Safe driving", "Cash handling & billing", "Customer service"];
    for (const rs of Object.values(FAMILY_RUBRICS)) for (const r of rs) if (safety.includes(r.skillName)) expect(r.redFlags.length, r.skillName).toBeGreaterThan(0);
  });

  it("only reference lexicon groups that exist", () => {
    for (const rs of Object.values(FAMILY_RUBRICS)) {
      for (const r of rs) {
        for (const c of [...r.concepts, ...r.redFlags]) {
          for (const p of c.patterns) {
            const words = "any" in p ? p.any : "pair" in p ? [...p.pair[0], ...p.pair[1]] : [p.phrase];
            for (const w of words) expect(() => expand(w), `${r.skillName}/${c.id}`).not.toThrow();
          }
        }
      }
    }
  });

  it("flag the classic unsafe emergency response", () => {
    const r = FAMILY_RUBRICS.caregiver.find((x) => x.skillName === "Handling emergencies")!;
    expect(gradeSkill("I will lift her up and put her on the bed.", r).score).toBeLessThanOrEqual(1);
    expect(gradeSkill("I will not lift her. I call 108 and check she is breathing, then keep her warm with a blanket.", r).score).toBeGreaterThanOrEqual(3);
  });
});

describe("selectRubrics", () => {
  const wh = TEMPLATES.find((t) => t.family === "warehouse")!.skills;

  it("resolves shared skill names to the majority family", () => {
    expect(selectRubrics(wh).get("Reliability")).toBe(WAREHOUSE_RUBRICS.find((r) => r.skillName === "Reliability"));
  });

  it("falls back to a generic rubric for renamed skills", () => {
    const renamed = [...wh.slice(0, 4), { name: "Shows up on time", keywords: ["punctual"] }];
    expect(selectRubrics(renamed).get("Shows up on time")!.concepts[0].id).toBe("kw:punctual");
  });

  it("ignores a family that matches only a minority of the scorecard", () => {
    const kitchen = [
      { name: "Food hygiene", keywords: ["wash"] },
      { name: "Speed in prep", keywords: ["prep"] },
      { name: "Teamwork", keywords: ["chef"] },
    ];
    expect(selectRubrics(kitchen).get("Teamwork")!.concepts[0].id).toBe("kw:chef");
  });

  it("uses generic rubrics for custom roles", () => {
    expect(selectRubrics([{ name: "Food hygiene", keywords: ["wash"] }]).get("Food hygiene")!.redFlags).toEqual([]);
  });

  it("matches names case-insensitively", () => {
    const lower = wh.map((s) => ({ ...s, name: s.name.toLowerCase() }));
    expect(selectRubrics(lower).get("reliability")).toBe(WAREHOUSE_RUBRICS.find((r) => r.skillName === "Reliability"));
  });
});
