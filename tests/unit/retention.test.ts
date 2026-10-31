import { describe, it, expect } from "vitest";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, isExpired, retentionCutoff } from "@/domain/retention";

describe("retention cutoff", () => {
  const now = new Date("2026-10-30T12:00:00Z");

  it("is now minus the retention period", () => {
    expect(retentionCutoff(now, 365).getTime()).toBe(now.getTime() - 365 * 86_400_000);
  });

  it("keeps data exactly at the cutoff and expires anything older", () => {
    const cutoff = retentionCutoff(now, 30);
    expect(isExpired(cutoff, cutoff)).toBe(false);
    expect(isExpired(new Date(cutoff.getTime() - 1), cutoff)).toBe(true);
  });

  it("allows 30 days to 3 years", () => {
    expect([RETENTION_MIN_DAYS, RETENTION_MAX_DAYS]).toEqual([30, 1095]);
  });
});
