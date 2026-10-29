import { describe, it, expect } from "vitest";
import { canPublish, gstBreakdown, formatINR } from "@/domain/billing";

const now = new Date("2026-10-29T10:00:00Z");
const future = new Date("2026-11-10T00:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");

describe("canPublish", () => {
  const trial = { plan: "TRIAL" as const, status: "ACTIVE", trialEndsAt: future, currentPeriodEnd: null };

  it("allows the first job on a trial", () => {
    expect(canPublish(trial, 0, 0, now)).toEqual({ ok: true });
  });

  it("blocks a second job on a trial", () => {
    expect(canPublish(trial, 1, 0, now).ok).toBe(false);
  });

  it("lets a job credit add a slot", () => {
    expect(canPublish(trial, 1, 1, now)).toEqual({ ok: true });
  });

  it("blocks an expired trial without credits", () => {
    const r = canPublish({ ...trial, trialEndsAt: past }, 0, 0, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/trial/i);
  });

  it("allows an expired trial that has a credit", () => {
    expect(canPublish({ ...trial, trialEndsAt: past }, 0, 1, now)).toEqual({ ok: true });
  });

  it("gives Starter three jobs and Growth unlimited", () => {
    const starter = { plan: "STARTER" as const, status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: future };
    expect(canPublish(starter, 2, 0, now).ok).toBe(true);
    expect(canPublish(starter, 3, 0, now).ok).toBe(false);
    expect(canPublish({ ...starter, plan: "GROWTH" }, 50, 0, now).ok).toBe(true);
  });

  it("blocks a lapsed paid plan", () => {
    const lapsed = { plan: "GROWTH" as const, status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: past };
    expect(canPublish(lapsed, 0, 0, now).ok).toBe(false);
  });
});

describe("money", () => {
  it("adds 18% GST in paise", () => {
    expect(gstBreakdown(299900)).toEqual({ subtotal: 299900, gst: 53982, total: 353882 });
    expect(gstBreakdown(99900)).toEqual({ subtotal: 99900, gst: 17982, total: 117882 });
  });

  it("formats rupees in Indian style", () => {
    expect(formatINR(353882)).toBe("₹3,538.82");
    expect(formatINR(99900)).toBe("₹999");
    expect(formatINR(1234567800)).toBe("₹1,23,45,678");
  });
});
