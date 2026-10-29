import { describe, it, expect } from "vitest";
import { checkWording, applySuggestion } from "@/domain/wording";

const ctx = { skillNames: ["Patient care", "Communication"], hourly: true };
const phrases = (text: string, c = ctx) => checkWording(text, c).map((f) => f.phrase.toLowerCase());

describe("checkWording", () => {
  it("flags age-coded words", () => {
    expect(phrases("We want young and energetic people")).toContain("young");
  });

  it("flags gendered job titles with a neutral suggestion", () => {
    const flag = checkWording("Hiring a salesman for our store", ctx).find((f) => f.phrase === "salesman");
    expect(flag?.suggestion).toBe("salesperson");
  });

  it("flags jargon", () => {
    expect(phrases("Join as a rockstar caregiver")).toContain("rockstar");
  });

  it("suggests fluency instead of native speaker", () => {
    const flag = checkWording("Native English speaker required", ctx)[0];
    expect(flag.suggestion).toBe("fluent in English");
  });

  it("flags degree requirements only for hourly roles", () => {
    expect(phrases("Bachelor's degree required")).toContain("bachelor's degree required");
    expect(phrases("Bachelor's degree required", { ...ctx, hourly: false })).toEqual([]);
  });

  it("flags lifting requirements when no physical skill exists", () => {
    expect(phrases("Must be able to lift 25 kg").some((p) => p.includes("lift 25 kg"))).toBe(true);
    expect(phrases("Must be able to lift 25 kg", { ...ctx, skillNames: ["Safe lifting"] })).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(phrases("Our youngest branch opened in 2020")).toEqual([]);
  });

  it("returns no flags for neutral text", () => {
    expect(checkWording("Support residents with daily care in a friendly team.", ctx)).toEqual([]);
  });

  it("reports where each phrase starts", () => {
    const [flag] = checkWording("Be a ninja", ctx);
    expect(flag.index).toBe(5);
  });
});

describe("applySuggestion", () => {
  it("replaces the flagged phrase at its position", () => {
    const text = "Hiring a salesman. The salesman greets customers.";
    const [first] = checkWording(text, ctx);
    expect(applySuggestion(text, first)).toBe("Hiring a salesperson. The salesman greets customers.");
  });
});
