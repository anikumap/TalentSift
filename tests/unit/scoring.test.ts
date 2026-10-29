import { describe, it, expect } from "vitest";
import { normalizeWeights, computeTotal, resumeSignal } from "@/domain/scoring";

describe("normalizeWeights", () => {
  it("splits equal weights into integers summing to 100", () => {
    expect(normalizeWeights([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("splits all-zero weights equally", () => {
    expect(normalizeWeights([0, 0, 0, 0])).toEqual([25, 25, 25, 25]);
  });

  it("scales proportionally and always sums to exactly 100", () => {
    const w = normalizeWeights([30, 30, 30, 30, 30, 30]);
    expect(w.reduce((a, b) => a + b, 0)).toBe(100);
    expect(normalizeWeights([50, 25, 25])).toEqual([50, 25, 25]);
    expect(normalizeWeights([2, 1, 1])).toEqual([50, 25, 25]);
  });

  it("treats negative weights as zero", () => {
    expect(normalizeWeights([-5, 10, 10])).toEqual([0, 50, 50]);
  });
});

describe("computeTotal", () => {
  const skills = [
    { id: "a", weight: 50 },
    { id: "b", weight: 50 },
  ];

  it("gives 100 for perfect scores without a resume", () => {
    expect(computeTotal(skills, [{ skillId: "a", score: 4 }, { skillId: "b", score: 4 }], null)).toBe(100);
  });

  it("blends 90% skills and 10% resume signal", () => {
    expect(computeTotal(skills, [{ skillId: "a", score: 2 }, { skillId: "b", score: 2 }], 1)).toBe(55);
  });

  it("treats a missing grade as zero", () => {
    expect(computeTotal(skills, [{ skillId: "a", score: 4 }], null)).toBe(50);
  });
});

describe("resumeSignal", () => {
  it("combines capped experience and matching certifications", () => {
    expect(resumeSignal({ certifications: ["CPR"], yearsExperience: 10, titles: [] }, ["cpr"])).toBe(1);
    expect(resumeSignal({ certifications: [], yearsExperience: 0, titles: [] }, ["cpr"])).toBe(0);
    expect(resumeSignal({ certifications: ["Forklift"], yearsExperience: 2.5, titles: [] }, ["cpr"])).toBe(0.25);
  });
});
