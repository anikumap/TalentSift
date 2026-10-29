import { describe, it, expect } from "vitest";
import { MockAIProvider } from "@/providers/ai/mock";
import type { IntakeAnswers } from "@/providers/types";

const ai = new MockAIProvider();

const intake = (over: Partial<IntakeAnswers> = {}): IntakeAnswers => ({
  title: "Home Caregiver",
  location: "Pune",
  tasks: "help with bathing, give medicines on time, keep notes",
  mustHaves: "Weekend availability",
  payMin: 18000,
  payMax: 24000,
  shifts: "Day and night shifts",
  ...over,
});

describe("MockAIProvider.generateScorecard", () => {
  it("uses the caregiver template for caregiver titles", async () => {
    const card = await ai.generateScorecard(intake());
    expect(card.roleFamily).toBe("caregiver");
    expect(card.skills.reduce((a, s) => a + s.weight, 0)).toBe(100);
    expect(card.skills.length).toBeGreaterThanOrEqual(4);
    expect(card.questions).toHaveLength(3);
  });

  it("adds must-haves typed by the manager", async () => {
    const card = await ai.generateScorecard(intake());
    expect(card.mustHaves.some((m) => /weekend/i.test(m.label))).toBe(true);
  });

  it("builds skills from tasks for unknown roles", async () => {
    const card = await ai.generateScorecard(
      intake({ title: "Pastry chef", tasks: "bake bread, decorate cakes, clean kitchen", mustHaves: "" }),
    );
    expect(card.roleFamily).toBe("general");
    expect(card.skills).toHaveLength(3);
    expect(card.skills.map((s) => s.name)).toContain("Bake bread");
    expect(card.questions).toHaveLength(3);
  });

  it("detects warehouse, retail and driver roles", async () => {
    expect((await ai.generateScorecard(intake({ title: "Warehouse Associate" }))).roleFamily).toBe("warehouse");
    expect((await ai.generateScorecard(intake({ title: "Store Cashier" }))).roleFamily).toBe("retail");
    expect((await ai.generateScorecard(intake({ title: "Delivery Driver" }))).roleFamily).toBe("driver");
  });
});

describe("MockAIProvider.gradeAnswers", () => {
  const skills = [
    { name: "Patient care", keywords: ["calm", "comfort", "dignity", "safety"] },
    { name: "Medication", keywords: ["medicine", "dose", "schedule", "doctor"] },
  ];
  const questions = [{ prompt: "A patient refuses medicine. What do you do?", skillNames: ["Patient care", "Medication"] }];

  it("is deterministic", async () => {
    const input = { skills, questions, answers: ["I stay calm and explain the medicine dose."] };
    expect(await ai.gradeAnswers(input)).toEqual(await ai.gradeAnswers(input));
  });

  it("scores by keyword evidence and quotes the sentence", async () => {
    const grades = await ai.gradeAnswers({
      skills,
      questions,
      answers: ["Hello. I would stay calm and protect their dignity. Then I would call the doctor."],
    });
    const care = grades.find((g) => g.skillName === "Patient care")!;
    expect(care.score).toBe(2);
    expect(care.evidence).toEqual(["I would stay calm and protect their dignity."]);
    expect(grades.find((g) => g.skillName === "Medication")!.score).toBe(1);
  });

  it("gives zero with no evidence for an empty answer", async () => {
    const grades = await ai.gradeAnswers({ skills, questions, answers: [""] });
    expect(grades.every((g) => g.score === 0 && g.evidence.length === 0)).toBe(true);
  });
});

describe("MockAIProvider.parseResume", () => {
  it("extracts years, certifications and titles", async () => {
    const parsed = await ai.parseResume("5 years as Caregiver. CPR certified. GDA certificate");
    expect(parsed.yearsExperience).toBe(5);
    expect(parsed.certifications).toContain("CPR");
    expect(parsed.titles).toContain("Caregiver");
  });
});

describe("MockAIProvider.generateJobAd", () => {
  it("mentions the title, location and pay", async () => {
    const card = await ai.generateScorecard(intake());
    const ad = await ai.generateJobAd(
      { title: "Home Caregiver", location: "Pune", payMin: 18000, payMax: 24000, shifts: "Day shifts" },
      card,
    );
    expect(ad).toContain("Home Caregiver");
    expect(ad).toContain("Pune");
    expect(ad).toContain("₹18,000");
  });
});
