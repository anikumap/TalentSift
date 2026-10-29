import { requireActor } from "@/lib/session";
import { date } from "@/lib/format";
import { getBilling } from "@/services/billing";
import { startCheckoutAction } from "@/app/actions/billing";
import { formatINR } from "@/domain/billing";
import { Notice, PageHeader, cx } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export const metadata = { title: "Billing" };

const PLAN_NAMES = { TRIAL: "Free trial", STARTER: "Starter", GROWTH: "Growth" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const actor = await requireActor();
  const b = await getBilling(actor);
  const { paid } = await searchParams;
  const s = b.subscription;
  const endsAt = s.plan === "TRIAL" ? s.trialEndsAt : s.currentPeriodEnd;
  const expired = !endsAt || endsAt <= new Date();
  const limit = b.limit === Infinity ? "Unlimited" : String(b.limit);

  return (
    <>
      <PageHeader title="Billing" description="Prices are in Indian rupees and exclude 18% GST, which is added at checkout." />
      {paid && (
        <div className="mb-6">
          <Notice tone="ok">Payment received. Your plan is updated.</Notice>
        </div>
      )}

      <section className="panel mb-8 grid gap-4 p-5 sm:grid-cols-3" aria-label="Current plan">
        <div>
          <p className="text-sm text-ink-3">Current plan</p>
          <p className="text-lg font-bold">{PLAN_NAMES[s.plan]}</p>
          <p className={cx("text-sm", expired ? "text-reject" : "text-ink-2")}>
            {expired ? "Ended" : s.plan === "TRIAL" ? "Ends" : "Renews"} {endsAt ? date(endsAt) : ""}
          </p>
        </div>
        <div>
          <p className="text-sm text-ink-3">Open jobs</p>
          <p className="tnum text-lg font-bold">
            {b.openJobs} <span className="text-sm font-medium text-ink-3">of {limit}</span>
          </p>
        </div>
        <div>
          <p className="text-sm text-ink-3">Unused single-job credits</p>
          <p className="tnum text-lg font-bold">{b.activeCredits}</p>
        </div>
      </section>

      <h2 className="mb-3 text-base font-semibold">Plans</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {b.plans.map((p) => {
          const current = p.key === s.plan && !expired;
          return (
            <div key={p.key} className={cx("panel flex flex-col p-5", current && "border-primary ring-1 ring-primary")}>
              <p className="font-semibold">{p.name}</p>
              <p className="tnum mt-2 text-3xl font-bold">
                {formatINR(p.pricePaise)}
                <span className="text-sm font-medium text-ink-3">{p.key === "JOB_CREDIT" ? " one-off" : " / month"}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-primary">{p.jobs}</p>
              <p className="mt-1 flex-1 text-sm text-ink-2">{p.blurb}</p>
              <form action={startCheckoutAction.bind(null, p.key)} className="mt-4">
                {current ? (
                  <p className="text-sm font-semibold text-ink-3">Your current plan</p>
                ) : (
                  <SubmitButton className={p.key === "JOB_CREDIT" ? "btn-secondary w-full" : "btn-primary w-full"} pendingText="Opening checkout…">
                    {p.key === "JOB_CREDIT" ? "Buy one job" : `Switch to ${p.name}`}
                  </SubmitButton>
                )}
              </form>
            </div>
          );
        })}
      </div>
    </>
  );
}
