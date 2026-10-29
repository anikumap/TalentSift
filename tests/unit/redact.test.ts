import { describe, it, expect } from "vitest";
import { redactText } from "@/domain/redact";

describe("redactText", () => {
  it("removes names, phone numbers and emails", () => {
    expect(
      redactText("Call Priya Sharma at +91 98765 43210 or priya@x.in", ["Priya", "Sharma"]),
    ).toBe("Call [name] [name] at [phone] or [email]");
  });

  it("matches names case-insensitively as whole words", () => {
    expect(redactText("PRIYA helped; Priyanka did not", ["Priya"])).toBe("[name] helped; Priyanka did not");
  });

  it("ignores one-letter name tokens and leaves short numbers alone", () => {
    expect(redactText("A. worked 3 shifts in 2024", ["A"])).toBe("A. worked 3 shifts in 2024");
  });

  it("handles names with regex characters", () => {
    expect(redactText("Hi (Raj)", ["(Raj)"])).toBe("Hi [name]");
  });
});
