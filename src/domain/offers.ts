import { istDayKey, istToUtc } from "./interviews";

export const OFFER_RESPOND_MAX_DAYS = 30;
export const OFFER_TERMS_MAX = 2000;
export const DECLINE_REASON_MAX = 500;
/** Sanity cap on monthly pay (₹1 crore); also keeps it inside a 32-bit database integer. */
export const MONTHLY_PAY_MAX = 10_000_000;

export type OfferInput = { monthlyPay: number; startDate: string; respondBy: string };

const DAY = 86_400_000;

/** Whole days from `a` to `b`, both "YYYY-MM-DD". */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

function validDate(s: string): boolean {
  try {
    istToUtc(s, "00:00");
    return true;
  } catch {
    return false;
  }
}

/** Field errors for an offer; empty when it's fine. Dates are India calendar days. */
export function validateOfferInput(input: OfferInput, now: Date): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = istDayKey(now);
  if (!Number.isInteger(input.monthlyPay) || input.monthlyPay <= 0) errors.monthlyPay = "Enter the monthly pay in whole rupees";
  else if (input.monthlyPay > MONTHLY_PAY_MAX) errors.monthlyPay = "That's more than ₹1 crore a month. Check the amount";
  if (!validDate(input.startDate)) errors.startDate = "Choose a start date";
  else if (input.startDate < today) errors.startDate = "The start date can't be in the past";
  if (!validDate(input.respondBy)) errors.respondBy = "Choose a reply-by date";
  else {
    const d = daysBetween(today, input.respondBy);
    if (d < 1) errors.respondBy = "Give them until at least tomorrow";
    else if (d > OFFER_RESPOND_MAX_DAYS) errors.respondBy = `Ask for a reply within ${OFFER_RESPOND_MAX_DAYS} days`;
  }
  return errors;
}

/** The offer link works until the last moment of `respondBy` in India. */
export function offerLinkExpiry(respondBy: string): Date {
  return new Date(istToUtc(respondBy, "00:00").getTime() + DAY - 1);
}

export function payOutsideRange(pay: number, min: number, max: number): boolean {
  return pay < min || pay > max;
}
