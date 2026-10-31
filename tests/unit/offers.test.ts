import { describe, it, expect } from "vitest";
import { offerLinkExpiry, payOutsideRange, validateOfferInput } from "@/domain/offers";

// 2026-11-04 10:00 IST
const NOW = new Date("2026-11-04T04:30:00Z");
const ok = { monthlyPay: 20000, startDate: "2026-11-10", respondBy: "2026-11-07" };

describe("validateOfferInput", () => {
  it("accepts a sensible offer", () => {
    expect(validateOfferInput(ok, NOW)).toEqual({});
  });

  it("needs a positive whole number of rupees", () => {
    for (const monthlyPay of [0, -1, 1.5, Number.NaN, 3_000_000_000]) {
      expect(validateOfferInput({ ...ok, monthlyPay }, NOW)).toHaveProperty("monthlyPay");
    }
  });

  it("refuses a start date before today in India", () => {
    expect(validateOfferInput({ ...ok, startDate: "2026-11-03" }, NOW)).toHaveProperty("startDate");
    expect(validateOfferInput({ ...ok, startDate: "2026-11-04" }, NOW)).toEqual({});
    expect(validateOfferInput({ ...ok, startDate: "nope" }, NOW)).toHaveProperty("startDate");
  });

  it("uses the India date near midnight UTC", () => {
    // 2026-11-04 23:00 UTC is already 5 Nov in India, so 4 Nov is in the past there.
    const late = new Date("2026-11-04T23:00:00Z");
    expect(validateOfferInput({ ...ok, startDate: "2026-11-04" }, late)).toHaveProperty("startDate");
  });

  it("needs a reply date from tomorrow to 30 days out", () => {
    expect(validateOfferInput({ ...ok, respondBy: "2026-11-04" }, NOW)).toHaveProperty("respondBy");
    expect(validateOfferInput({ ...ok, respondBy: "2026-11-05" }, NOW)).toEqual({});
    expect(validateOfferInput({ ...ok, respondBy: "2026-12-04" }, NOW)).toEqual({});
    expect(validateOfferInput({ ...ok, respondBy: "2026-12-05" }, NOW)).toHaveProperty("respondBy");
  });
});

describe("offerLinkExpiry", () => {
  it("is the last millisecond of that day in India", () => {
    expect(offerLinkExpiry("2026-11-10").toISOString()).toBe("2026-11-10T18:29:59.999Z");
  });
});

describe("payOutsideRange", () => {
  it("flags pay outside the advertised range only", () => {
    expect(payOutsideRange(18000, 18000, 24000)).toBe(false);
    expect(payOutsideRange(24000, 18000, 24000)).toBe(false);
    expect(payOutsideRange(17999, 18000, 24000)).toBe(true);
    expect(payOutsideRange(24001, 18000, 24000)).toBe(true);
  });
});
