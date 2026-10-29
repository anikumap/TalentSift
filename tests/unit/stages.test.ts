import { describe, it, expect } from "vitest";
import { nextStage, canTransition } from "@/domain/stages";

describe("stages", () => {
  it("advances through the pipeline", () => {
    expect(nextStage("APPLIED")).toBe("SHORTLISTED");
    expect(nextStage("OFFER")).toBe("HIRED");
    expect(nextStage("HIRED")).toBeNull();
    expect(nextStage("REJECTED")).toBeNull();
  });

  it("refuses moves out of final stages", () => {
    expect(canTransition("REJECTED", "SHORTLISTED")).toBe(false);
    expect(canTransition("HIRED", "OFFER")).toBe(false);
  });

  it("allows rejecting or holding from any open stage", () => {
    expect(canTransition("INTERVIEW", "REJECTED")).toBe(true);
    expect(canTransition("APPLIED", "ON_HOLD")).toBe(true);
  });

  it("lets on-hold candidates return to any open stage", () => {
    expect(canTransition("ON_HOLD", "INTERVIEW")).toBe(true);
    expect(canTransition("ON_HOLD", "APPLIED")).toBe(true);
  });

  it("refuses a move to the same stage", () => {
    expect(canTransition("APPLIED", "APPLIED")).toBe(false);
  });
});
