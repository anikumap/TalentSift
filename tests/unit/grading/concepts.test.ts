import { describe, it, expect } from "vitest";
import { matchConcepts, type Concept, type Pattern } from "@/domain/grading/concepts";
import { expand } from "@/domain/grading/lexicon";
import { splitSentences } from "@/domain/grading/normalize";

const C = (id: string, weight: 1 | 2, patterns: Pattern[], inv = false): Concept => ({ id, weight, patterns, invertsUnderNegation: inv });
const escalate = C("escalate", 2, [{ pair: [["@inform"], ["supervisor", "doctor", "family"]] }]);
const calm = C("calm", 1, [{ any: ["calm", "gently", "patient"] }]);
const noMove = C("no-move", 2, [{ any: ["move", "lift"] }], true);
const firstAid = C("first-aid", 1, [{ phrase: "first aid" }]);
const hits = (t: string, cs: Concept[]) => matchConcepts(splitSentences(t), cs).map((h) => h.conceptId);

describe("expand", () => {
  it("resolves group references", () => {
    expect(expand("@inform")).toContain("tell");
    expect(expand("doctor")).toEqual(["doctor"]);
  });
});

describe("matchConcepts", () => {
  it("matches an ordered pair through a synonym group", () => {
    expect(hits("I will tell the supervisor at once", [escalate])).toEqual(["escalate"]);
    expect(hits("I will inform the head nurse and then the doctor", [escalate])).toEqual(["escalate"]);
  });

  it("requires pair order", () => {
    expect(hits("supervisor, then I tell", [escalate])).toEqual([]);
  });

  it("matches inflected forms through stems", () => {
    expect(hits("I called the doctor", [escalate])).toEqual(["escalate"]);
  });

  it("matches fixed phrases", () => {
    expect(hits("I give first aid", [firstAid])).toEqual(["first-aid"]);
  });

  it("ignores negated matches", () => {
    expect(hits("I would not tell the doctor", [escalate])).toEqual([]);
  });

  it("credits inverted concepts only when negated", () => {
    expect(hits("I would not move her", [noMove])).toEqual(["no-move"]);
    expect(hits("I move her to the bed", [noMove])).toEqual([]);
  });

  it("counts a concept once per text", () => {
    expect(hits("I stay calm. I stay calm. I stay calm.", [calm])).toHaveLength(1);
  });

  it("needs an action verb in the sentence", () => {
    expect(hits("calm gently patient", [calm])).toEqual([]);
  });

  it("needs an action verb in the concept's clause; short clauses inherit the previous one", () => {
    const many = ["a1", "a2", "a3", "a4"].map((w, i) => C(w, i === 0 ? 2 : 1, [{ any: [w] }]));
    expect(hits("I check a1 and then a2 and later a3 and also a4 carefully today", many)).toEqual(["a1", "a2", "a3"]);
  });

  it("credits every action in a natural comma-separated sentence", () => {
    const cs = ["wash", "gloves", "board", "chef"].map((w) => C(w, 1, [{ any: [w] }]));
    expect(hits("I wash my hands, wear gloves, clean the board and tell the chef.", cs)).toHaveLength(4);
  });

  it("lets a short clause inherit a verb from the clause after it", () => {
    const gear = C("gear", 1, [{ any: ["raincoat"] }]);
    expect(hits("Raincoat and parcel cover i will use.", [gear])).toEqual(["gear"]);
  });

  it("credits objects listed under one verb", () => {
    const cs = ["barcode", "sku", "label"].map((w) => C(w, 1, [{ any: [w] }]));
    expect(hits("I check the barcode, the SKU and the label.", cs)).toHaveLength(3);
  });

  it("gives a comma-separated keyword list at most one concept, highest weight first", () => {
    const many = ["a1", "a2", "a3", "a4"].map((w, i) => C(w, i === 0 ? 2 : 1, [{ any: [w] }]));
    expect(hits("I show a1, a2, a3, a4 always", many)).toEqual(["a1"]);
    const words = ["check", "scan", "label", "verify"].map((w) => C(w, 1, [{ any: [w] }]));
    expect(hits("Check, scan, label, verify, barcode, SKU.", words)).toHaveLength(1);
  });

  it("lets long run-on sentences carry more concepts", () => {
    const cs = ["calm", "explain", "daughter", "chart"].map((w) => C(w, 1, [{ any: [w] }]));
    const blob =
      "i stay calm and explain to her slowly why the tablet is needed and i would never force her and if she still says no i call her daughter and also tell the supervisor and note the time in the chart so the next shift knows";
    expect(hits(blob, cs)).toHaveLength(4);
  });
});
