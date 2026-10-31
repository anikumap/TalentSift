import { describe, it, expect } from "vitest";
import { markNegated } from "@/domain/grading/negation";
import { splitSentences } from "@/domain/grading/normalize";

const neg = (t: string) => {
  const [s] = splitSentences(t);
  const marks = markNegated(s.tokens, s.raw);
  return s.tokens.filter((_, i) => marks[i]).map((x) => x.text);
};

describe("markNegated", () => {
  it("marks the words after a negator", () => {
    expect(neg("I would never force the medicine")).toEqual(["force", "the", "medicine"]);
  });

  it("handles curly apostrophes and stops at a comma", () => {
    expect(neg("I won’t move her, I call 108")).toEqual(["move", "her"]);
  });

  it("stops at but", () => {
    expect(neg("I don't argue but I listen")).toEqual(["argue"]);
  });

  it("treats without as a negator", () => {
    expect(neg("Without checking the label I would not pack it and then I report")).toContain("checking");
  });

  it("stops at and then", () => {
    expect(neg("I would not pack it and then I report")).toEqual(["pack", "it"]);
  });

  it("does not treat a quoted or interjected no as negation", () => {
    expect(neg("if she still says no i call her daughter")).toEqual([]);
    expect(neg("No, I call the supervisor")).toEqual([]);
  });

  it("treats rather than / instead of as negators", () => {
    expect(neg("I own up to the manager rather than hiding it")).toEqual(["hiding", "it"]);
    expect(neg("I report it instead of covering it up")).toEqual(["covering", "it", "up"]);
    expect(neg("Instead I call the supervisor")).toEqual([]);
  });

  it("ends a span when a new clause starts with I/we or then", () => {
    expect(neg("If she does not take it I will tell her family")).toEqual(["take", "it"]);
    expect(neg("if no pick up then i will ask the watchman")).toEqual(["pick", "up"]);
  });

  it("marks nothing in a plain sentence", () => {
    expect(neg("I call the supervisor")).toEqual([]);
  });

  it("caps a span at 6 tokens", () => {
    expect(neg("not a b c d e f g h")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
