import { describe, it, expect } from "vitest";
import { MockAIProvider } from "@/providers/ai/mock";
import { RuleBasedAIProvider } from "@/providers/ai/rule-based";
import { TAGS, breakdown, formatReport, gradeAll, inputFor, loadBenchmark, spearman } from "./harness";

describe("grading benchmark", () => {
  it("benchmark data is well-formed", () => {
    const files = loadBenchmark();
    expect(files.map((f) => f.family).sort()).toEqual(["caregiver", "driver", "generic", "retail", "warehouse"]);
    for (const f of files) {
      for (const e of f.entries) {
        const q = inputFor(f, e).questions[e.questionIndex];
        expect(Object.keys(e.labels).sort(), e.id).toEqual([...q.skillNames].sort());
        for (const v of Object.values(e.labels)) expect([0, 1, 2, 3, 4], e.id).toContain(v);
        if (e.tags.includes("unsafe")) expect(q.skillNames, e.id).toContain(e.safetySkill);
        for (const t of e.tags) expect(TAGS as readonly string[], e.id).toContain(t);
      }
    }
    const ids = files.flatMap((f) => f.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    const holdoutTags = new Set(files.flatMap((f) => f.entries.filter((e) => e.split === "holdout").flatMap((e) => e.tags)));
    for (const t of TAGS) expect(holdoutTags, t).toContain(t);
  });

  it("spearman handles ties", () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(spearman([1, 2, 2, 3], [1, 3, 2, 4])).toBeGreaterThan(0.7);
  });

  const T = { tune: [0.85, 0.6, 0.75], holdout: [0.85, 0.55, 0.7], generic: [0.75, 0.45, 0.6] } as const;
  it.each([
    ["tune", { split: "tune", generic: false }],
    ["holdout", { split: "holdout", generic: false }],
    ["generic", { generic: true }],
  ] as const)("rules meet %s thresholds", async (name, filter) => {
    const m = breakdown(await gradeAll(loadBenchmark(), new RuleBasedAIProvider(), filter)).all;
    console.log("\n" + formatReport({ [`rules/${name}`]: m }));
    const [within, exact, rho] = T[name];
    expect(m.withinOne).toBeGreaterThanOrEqual(within);
    expect(m.exact).toBeGreaterThanOrEqual(exact);
    expect(m.spearman).toBeGreaterThanOrEqual(rho);
    if (name !== "generic") {
      expect(m.unsafeOk).toBe(1);
      expect(m.stuffingOk).toBe(1);
    }
  });

  it("prints the mock baseline", async () => {
    const files = loadBenchmark();
    const mock = new MockAIProvider();
    const report = {
      "mock/tune": breakdown(await gradeAll(files, mock, { split: "tune", generic: false })).all,
      "mock/holdout": breakdown(await gradeAll(files, mock, { split: "holdout", generic: false })).all,
      "mock/generic": breakdown(await gradeAll(files, mock, { generic: true })).all,
    };
    console.log("\n" + formatReport(report));
  });
});
