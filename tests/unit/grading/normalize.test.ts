import { describe, it, expect } from "vitest";
import { normalizeText, splitSentences, stem } from "@/domain/grading/normalize";

describe("stem", () => {
  it("reduces inflections to a shared stem", () => {
    expect(stem("medicines")).toBe(stem("medicine"));
    expect(stem("calling")).toBe("call");
    expect(stem("called")).toBe("call");
    expect(stem("stopped")).toBe("stop");
  });

  it("maps common irregular verbs", () => {
    expect(stem("told")).toBe("tell");
    expect(stem("gave")).toBe("give");
  });

  it("leaves short words alone", () => {
    expect(stem("is")).toBe("is");
  });
});

describe("normalizeText", () => {
  it("lowercases and maps British spellings", () => {
    expect(normalizeText("I will Organise")).toBe("i will organize");
  });

  it("maps common Indian English phrasing", () => {
    expect(normalizeText("will tell to madam")).toContain("tell supervisor");
  });

  it("straightens curly apostrophes", () => {
    expect(normalizeText("don’t")).toBe("don't");
  });
});

describe("splitSentences", () => {
  it("keeps raw text for evidence and normalised tokens for matching", () => {
    const s = splitSentences("First I stay calm. Then I call 108!\nDone");
    expect(s.map((x) => x.raw)).toEqual(["First I stay calm.", "Then I call 108!", "Done"]);
    expect(s[1].tokens.map((t) => t.text)).toEqual(["then", "i", "call", "108"]);
    expect(s.map((x) => x.position)).toEqual([0, 1, 2]);
  });

  it("returns nothing for empty text", () => {
    expect(splitSentences("")).toEqual([]);
  });
});
