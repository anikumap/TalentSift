import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import {
  PERIOD_DAYS,
  PLAN_JOB_LIMIT,
  PLAN_PRICES_PAISE,
  type CheckoutItem,
  type Plan,
} from "@/domain/constants";
import { audit } from "./audit";

const DAY = 86_400_000;

export const CHECKOUT_ITEMS: { key: CheckoutItem; name: string; pricePaise: number; jobs: string; blurb: string }[] = [
  { key: "STARTER", name: "Starter", pricePaise: PLAN_PRICES_PAISE.STARTER, jobs: "3 open jobs", blurb: "For a single location hiring steadily." },
  { key: "GROWTH", name: "Growth", pricePaise: PLAN_PRICES_PAISE.GROWTH, jobs: "Unlimited open jobs", blurb: "For multi-site teams hiring every week." },
  { key: "JOB_CREDIT", name: "Single job", pricePaise: PLAN_PRICES_PAISE.JOB_CREDIT, jobs: "1 extra job for 30 days", blurb: "For occasional hiring. No subscription." },
];

export async function getBilling(actor: Actor) {
  assertCan(actor, "org.admin");
  const now = new Date();
  const [sub, openJobs, credits] = await Promise.all([
    db.subscription.findUniqueOrThrow({ where: { orgId: actor.orgId } }),
    db.job.count({ where: { orgId: actor.orgId, status: "OPEN" } }),
    db.jobCredit.findMany({
      where: { orgId: actor.orgId, expiresAt: { gt: now } },
      include: { job: { select: { status: true } } },
    }),
  ]);
  const plan = sub.plan as Plan;
  return {
    subscription: { plan, status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd },
    openJobs,
    limit: PLAN_JOB_LIMIT[plan],
    activeCredits: credits.filter((c) => !c.jobId || c.job?.status !== "OPEN").length,
    plans: CHECKOUT_ITEMS,
  };
}

export async function startCheckout(actor: Actor, item: CheckoutItem): Promise<{ url: string; sessionId: string }> {
  assertCan(actor, "org.admin");
  if (!CHECKOUT_ITEMS.some((i) => i.key === item)) throw new AppError("VALIDATION", "Unknown plan.");
  return getProviders().billing.createCheckout(actor.orgId, item);
}

/** Verifies the provider session, then applies it once (repeat confirms are ignored). */
export async function confirmCheckout(actor: Actor, sessionId: string): Promise<CheckoutItem> {
  assertCan(actor, "org.admin");
  let item: CheckoutItem;
  try {
    item = await getProviders().billing.verify(actor.orgId, sessionId);
  } catch {
    throw new AppError("VALIDATION", "This checkout session is invalid.");
  }
  const already = await db.auditEvent.findFirst({
    where: { orgId: actor.orgId, entityType: "Checkout", entityId: sessionId },
  });
  if (already) return item;

  const now = Date.now();
  await db.$transaction(async (tx) => {
    const before = await tx.subscription.findUniqueOrThrow({ where: { orgId: actor.orgId } });
    if (item === "JOB_CREDIT") {
      await tx.jobCredit.create({ data: { orgId: actor.orgId, expiresAt: new Date(now + PERIOD_DAYS * DAY) } });
    } else {
      await tx.subscription.update({
        where: { orgId: actor.orgId },
        data: { plan: item, status: "ACTIVE", currentPeriodEnd: new Date(now + PERIOD_DAYS * DAY) },
      });
    }
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "PLAN_CHANGED",
      entityType: "Checkout",
      entityId: sessionId,
      before: { plan: before.plan },
      after: item === "JOB_CREDIT" ? { plan: before.plan, jobCredit: 1 } : { plan: item },
    });
  });
  return item;
}
