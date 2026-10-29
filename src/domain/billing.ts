import { GST_RATE, PLAN_JOB_LIMIT, type Plan } from "./constants";

export type SubscriptionState = {
  plan: Plan;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

export type PublishCheck = { ok: true } | { ok: false; reason: string };

/** Base plan slots (0 if the plan has lapsed) plus one slot per unused job credit. */
export function canPublish(
  sub: SubscriptionState,
  openJobs: number,
  activeCredits: number,
  now: Date,
): PublishCheck {
  const lapsed =
    sub.plan === "TRIAL"
      ? !sub.trialEndsAt || sub.trialEndsAt <= now
      : sub.status !== "ACTIVE" || !sub.currentPeriodEnd || sub.currentPeriodEnd <= now;
  const base = lapsed ? 0 : PLAN_JOB_LIMIT[sub.plan];
  if (openJobs < base + activeCredits) return { ok: true };

  if (lapsed) {
    return {
      ok: false,
      reason:
        sub.plan === "TRIAL"
          ? "Your free trial has ended. Choose a plan or buy a single job posting to publish."
          : "Your plan has lapsed. Renew it or buy a single job posting to publish.",
    };
  }
  return {
    ok: false,
    reason: `Your ${sub.plan.toLowerCase()} plan allows ${base} open job${base === 1 ? "" : "s"}. Close a job, upgrade, or buy a single job posting.`,
  };
}

export function gstBreakdown(paise: number): { subtotal: number; gst: number; total: number } {
  const gst = Math.round(paise * GST_RATE);
  return { subtotal: paise, gst, total: paise + gst };
}

/** ₹ in Indian digit grouping; paise shown only when non-zero. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}
