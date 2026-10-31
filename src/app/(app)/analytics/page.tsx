import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAnalytics, PERIODS, type Period } from "@/services/analytics";
import { listJobs } from "@/services/jobs";
import { STAGE_LABELS } from "@/domain/constants";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Analytics" };

const BUCKETS = ["0–19", "20–39", "40–59", "60–79", "80–100"];
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const dayText = (d: number | null) => (d === null ? "—" : `${d} ${d === 1 ? "day" : "days"}`);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ jobId?: string; period?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "stage.change")) redirect("/dashboard");
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "90";
  const [a, jobs] = await Promise.all([getAnalytics(actor, { jobId: sp.jobId || undefined, period }), listJobs(actor)]);
  const maxBucket = Math.max(1, ...a.scoreBuckets);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Where candidates drop off, how quickly the team decides, and what scores look like."
        actions={can(actor.role, "fairness.view") ? <Link href="/analytics/fairness" className="btn-secondary">Fairness monitor</Link> : undefined}
      />
      <form className="mb-6 flex flex-wrap items-end gap-3" aria-label="Filter analytics">
        <div>
          <label htmlFor="jobId" className="label">Job</label>
          <select id="jobId" name="jobId" defaultValue={sp.jobId ?? ""} className="field h-9 py-1">
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="period" className="label">Applied in</label>
          <select id="period" name="period" defaultValue={period} className="field h-9 py-1">
            {Object.entries(PERIODS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-sm text-ink-3">Time to first decision (median)</p>
          <p className="mt-1 text-2xl font-bold">{dayText(a.medianDaysToDecision)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-sm text-ink-3">Time to hire (median)</p>
          <p className="mt-1 text-2xl font-bold">{dayText(a.medianDaysToHire)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-sm text-ink-3">Waiting over 2 days for a first look</p>
          <p className="mt-1 text-2xl font-bold">{a.waiting}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="funnel-h">
          <h2 id="funnel-h" className="mb-3 text-base font-semibold">Hiring funnel</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="funnel-h">
              <thead className="border-b border-line text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Candidates</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">From previous step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.funnel.map((s) => (
                  <tr key={s.stage}>
                    <th scope="row" className="px-4 py-2.5 font-semibold">{STAGE_LABELS[s.stage]}</th>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{pct(s.conversion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-ink-3">A candidate rejected after an interview still counts as having reached Interview.</p>
        </section>

        <section aria-labelledby="scores-h">
          <h2 id="scores-h" className="mb-3 text-base font-semibold">Score distribution</h2>
          <div className="panel space-y-2 p-4">
            {a.scoreBuckets.map((count, i) => (
              <div key={BUCKETS[i]} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 tabular-nums text-ink-2">{BUCKETS[i]}</span>
                <span className="h-3 rounded bg-primary" style={{ width: `${(count / maxBucket) * 70}%`, minWidth: count ? 4 : 0 }} aria-hidden />
                <span className="tabular-nums">{count}</span>
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-6 text-base font-semibold">Rejection reasons</h2>
          {a.rejectionReasons.length === 0 ? (
            <p className="text-sm text-ink-3">No rejections in this period.</p>
          ) : (
            <ul className="panel divide-y divide-line text-sm">
              {a.rejectionReasons.map((r) => (
                <li key={r.reason} className="flex justify-between px-4 py-2.5">
                  <span>{r.reason}</span>
                  <span className="tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
