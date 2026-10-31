import { describe, it, expect } from "vitest";
import { canCandidateChange, istDateTime, istDayKey, istToUtc, overlaps, slotTimes, toIcs } from "@/domain/interviews";

const HOUR = 3_600_000;

describe("interview time helpers", () => {
  it("IST boundaries: converts an IST wall time to UTC", () => {
    expect(istToUtc("2026-11-04", "10:00").toISOString()).toBe("2026-11-04T04:30:00.000Z");
    expect(istToUtc("2026-11-04", "03:00").toISOString()).toBe("2026-11-03T21:30:00.000Z");
  });

  it("rejects malformed dates and times", () => {
    expect(() => istToUtc("2026-13-40", "10:00")).toThrow();
    expect(() => istToUtc("2026-11-04", "25:00")).toThrow();
  });

  it("makes back-to-back slots and drops a partial last one", () => {
    const s = slotTimes("2026-11-04", "10:00", "11:40", 30);
    expect(s.map((d) => d.toISOString())).toEqual(["2026-11-04T04:30:00.000Z", "2026-11-04T05:00:00.000Z", "2026-11-04T05:30:00.000Z"]);
    expect(slotTimes("2026-11-04", "11:00", "10:00", 30)).toEqual([]);
    expect(slotTimes("2026-11-04", "09:00", "18:00", 15)).toHaveLength(36);
  });

  it("treats touching intervals as not overlapping", () => {
    const a = { startsAt: new Date("2026-11-04T04:30:00Z"), durationMin: 30 };
    expect(overlaps(a, { startsAt: new Date("2026-11-04T05:00:00Z"), durationMin: 30 })).toBe(false);
    expect(overlaps(a, { startsAt: new Date("2026-11-04T04:59:00Z"), durationMin: 30 })).toBe(true);
    expect(overlaps(a, { startsAt: new Date("2026-11-04T04:00:00Z"), durationMin: 90 })).toBe(true);
  });

  it("lets candidates change until exactly 12 hours before", () => {
    const now = new Date("2026-11-04T00:00:00Z");
    expect(canCandidateChange(new Date(now.getTime() + 12 * HOUR), now)).toBe(true);
    expect(canCandidateChange(new Date(now.getTime() + 12 * HOUR - 1), now)).toBe(false);
  });

  it("formats in IST regardless of the server time zone", () => {
    expect(istDateTime(new Date("2026-11-04T04:30:00Z"))).toMatch(/10:00/);
    expect(istDayKey(new Date("2026-11-03T19:00:00Z"))).toBe("2026-11-04");
  });

  it("ics times: UTC stamps, CRLF lines and escaped text", () => {
    const ics = toIcs({
      uid: "abc",
      startsAt: new Date("2026-11-04T04:30:00Z"),
      durationMin: 30,
      summary: "Interview: Home Caregiver",
      location: "Flat 2, Kothrud; Pune\nGate B",
      description: "Bring ID",
    });
    expect(ics).toContain("DTSTART:20261104T043000Z\r\n");
    expect(ics).toContain("DTEND:20261104T050000Z\r\n");
    expect(ics).toContain("LOCATION:Flat 2\\, Kothrud\\; Pune\\nGate B\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
  });
});
