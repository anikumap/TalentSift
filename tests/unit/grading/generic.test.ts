import { describe, it, expect } from "vitest";
import { buildGenericRubric } from "@/domain/grading/generic";
import { gradeSkill } from "@/domain/grading/grade";

describe("buildGenericRubric", () => {
  const r = buildGenericRubric({ name: "Food hygiene", keywords: ["wash", "gloves", "clean"] });

  it("turns keywords into concepts plus generic action concepts, with no red flags", () => {
    expect(r.redFlags).toEqual([]);
    expect(r.concepts.map((c) => c.id)).toEqual(
      expect.arrayContaining(["kw:wash", "kw:gloves", "kw:clean", "gen:inform", "gen:check", "gen:calm", "gen:followup"]),
    );
  });

  it("sets strongWeight to 60% of the total", () => {
    expect(r.strongWeight).toBeCloseTo(0.6 * r.concepts.reduce((a, c) => a + c.weight, 0));
  });

  it("still works with no keywords", () => {
    expect(buildGenericRubric({ name: "X", keywords: [] }).concepts.length).toBe(4);
  });

  it("deduplicates keywords by stem", () => {
    expect(buildGenericRubric({ name: "X", keywords: ["clean", "cleaning", "Clean"] }).concepts.filter((c) => c.id.startsWith("kw:"))).toHaveLength(1);
  });

  it("scores a good answer highly", () => {
    expect(gradeSkill("I wash my hands, wear gloves, clean the board and tell the chef.", r).score).toBeGreaterThanOrEqual(3);
  });
});
