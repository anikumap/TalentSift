import { describe, it, expect } from "vitest";
import { qualityModifier } from "@/domain/grading/quality";
import { splitSentences } from "@/domain/grading/normalize";

const q = (t: string, hit = new Set<number>([0])) => qualityModifier(t, splitSentences(t), hit);

describe("qualityModifier", () => {
  it("rewards steps, concrete detail and ownership", () => {
    expect(q("First I stay calm. Then I call the doctor at 9 pm and note the time.").parts).toMatchObject({ steps: 0.5, concrete: 0.5, ownership: 0.25 });
  });

  it("counts a numbered list as steps", () => {
    expect(q("1. Check label 2. Scan again 3. Tell supervisor about it today please").parts.steps).toBe(0.5);
  });

  it("penalises vague filler outside concept sentences", () => {
    expect(q("I will handle it properly and do the needful as required.", new Set()).parts.filler).toBe(-0.5);
  });

  it("does not penalise filler in a sentence that also has a concept", () => {
    expect(q("I will handle it properly and call the doctor.", new Set([0])).parts.filler).toBe(0);
  });

  it("penalises answers under 8 words and clamps the total", () => {
    expect(q("I handle it").parts.short).toBe(-1);
    expect(q("I handle it").total).toBe(-1);
    expect(q("First then next finally I will check 2 boxes and count 3 items and report").total).toBeLessThanOrEqual(1);
  });

  it("gives nothing extra to a plain answer", () => {
    expect(q("We keep the place nice for all the customers here.", new Set()).total).toBe(0);
  });
});
