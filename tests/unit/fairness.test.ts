import { describe, it, expect } from "vitest";
import { FOUR_FIFTHS, MIN_GROUP, comparable, impactRatios, selectionRates } from "@/domain/fairness";
import type { Stage } from "@/domain/constants";

const rows = (group: string, n: number, selected: number, stage: Stage = "SHORTLISTED") =>
  Array.from({ length: n }, (_, i) => ({ group, reached: (i < selected ? stage : "APPLIED") as Stage }));

describe("fairness maths", () => {
  it("uses the four-fifths rule with groups of at least 5", () => {
    expect([FOUR_FIFTHS, MIN_GROUP]).toEqual([0.8, 5]);
  });

  it("flags a group whose selection rate is under 80% of the best group's", () => {
    const r = impactRatios(selectionRates([...rows("a", 100, 100), ...rows("b", 100, 79)], "SHORTLISTED"));
    expect(r.find((g) => g.group === "a")).toMatchObject({ rate: 1, ratio: 1, flagged: false });
    expect(r.find((g) => g.group === "b")).toMatchObject({ rate: 0.79, flagged: true });
    expect(r.find((g) => g.group === "b")!.ratio).toBeCloseTo(0.79);
  });

  it("does not flag exactly 80%", () => {
    const r = impactRatios(selectionRates([...rows("a", 10, 10), ...rows("b", 10, 8)], "SHORTLISTED"));
    expect(r.find((g) => g.group === "b")).toMatchObject({ flagged: false });
  });

  it("counts later stages as having reached earlier ones", () => {
    const r = selectionRates([...rows("a", 5, 2, "HIRED"), ...rows("b", 5, 0)], "SHORTLISTED");
    expect(r.find((g) => g.group === "a")).toMatchObject({ n: 5, selected: 2, rate: 0.4 });
  });

  it("hides the rate and ratio of groups smaller than 5", () => {
    const r = impactRatios(selectionRates([...rows("a", 10, 5), ...rows("b", 4, 4)], "SHORTLISTED"));
    expect(r.find((g) => g.group === "b")).toMatchObject({ n: 4, rate: null, ratio: null, flagged: false });
    expect(r.find((g) => g.group === "a")).toMatchObject({ ratio: 1 });
  });

  it("needs at least two groups of 5 to compare", () => {
    expect(comparable(selectionRates([...rows("a", 10, 5), ...rows("b", 4, 4)], "SHORTLISTED"))).toBe(false);
    expect(comparable(selectionRates([...rows("a", 5, 5), ...rows("b", 5, 4)], "SHORTLISTED"))).toBe(true);
  });

  it("handles empty input and an all-zero best rate", () => {
    expect(selectionRates([], "SHORTLISTED")).toEqual([]);
    const r = impactRatios(selectionRates([...rows("a", 5, 0), ...rows("b", 5, 0)], "SHORTLISTED"));
    expect(r.every((g) => g.ratio === null && !g.flagged)).toBe(true);
  });
});
