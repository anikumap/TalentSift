import { describe, it, expect } from "vitest";
import { funnel, median, pipelineIndex, scoreBuckets } from "@/domain/analytics";

describe("analytics maths", () => {
  it("builds an empty funnel without dividing by zero", () => {
    const f = funnel([]);
    expect(f.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
    expect(f.every((s) => s.conversion === null)).toBe(true);
  });

  it("counts later stages towards earlier steps", () => {
    const f = funnel(["HIRED", "APPLIED"]);
    expect(f.map((s) => [s.stage, s.count])).toEqual([
      ["APPLIED", 2],
      ["SHORTLISTED", 1],
      ["INTERVIEW", 1],
      ["OFFER", 1],
      ["HIRED", 1],
    ]);
    expect(f[0].conversion).toBeNull();
    expect(f[1].conversion).toBe(0.5);
    expect(f[2].conversion).toBe(1);
  });

  it("ranks pipeline stages and puts rejected/on-hold outside it", () => {
    expect(pipelineIndex("APPLIED")).toBe(0);
    expect(pipelineIndex("HIRED")).toBe(4);
    expect(pipelineIndex("REJECTED")).toBe(-1);
    expect(pipelineIndex("ON_HOLD")).toBe(-1);
  });

  it("takes medians of odd, even and empty lists", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("buckets scores into fifths with 100 in the top bucket", () => {
    expect(scoreBuckets([0, 19, 20, 79, 80, 100])).toEqual([2, 1, 0, 1, 2]);
  });
});
