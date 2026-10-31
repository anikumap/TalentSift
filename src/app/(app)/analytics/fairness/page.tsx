import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getFairnessReport } from "@/services/fairness";
import { listJobs } from "@/services/jobs";
import { FOUR_FIFTHS, MIN_GROUP } from "@/domain/fairness";
import { SELF_ID } from "@/domain/selfid";
import { STAGE_LABELS } from "@/domain/constants";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "Fairness monitor" };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default async function FairnessPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "fairness.view")) redirect("/analytics");
  const sp = await searchParams;
  const [r, jobs] = await Promise.all([getFairnessReport(actor, { jobId: sp.jobId || undefined }), listJobs(actor)]);

  return (
    <>
      <PageHeader
        title="Fairness monitor"
        description={`${r.responded} of ${r.total} applicants chose to describe themselves. Reviewers never see these answers.`}
        actions={<Link href="/analytics" className="btn-ghost">Back to analytics</Link>}
      />
      <form className="mb-6 flex flex-wrap items-end gap-3" aria-label="Filter fairness report">
        <div>
          <label htmlFor="jobId" className="label">Job</label>
          <select id="jobId" name="jobId" defaultValue={sp.jobId ?? ""} className="field h-9 py-1">
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      <div className="space-y-8">
        {r.characteristics.map((c) => {
          const options = SELF_ID[c.key].options as Record<string, string>;
          const groups = c.stages[0].rates;
          return (
            <section key={c.key} aria-labelledby={`${c.key}-h`}>
              <h2 id={`${c.key}-h`} className="mb-3 text-base font-semibold">{c.label}</h2>
              {!c.comparable ? (
                <p className="panel p-4 text-sm text-ink-2">
                  Not enough self-ID responses yet. We compare groups once at least two of them have {MIN_GROUP} or more decided applicants.
                </p>
              ) : (
                <div className="panel overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-ink-3">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 font-medium">Group</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">Applicants</th>
                        {c.stages.map((s) => (
                          <th key={s.stage} scope="col" className="px-4 py-2.5 text-right font-medium">Reached {STAGE_LABELS[s.stage]}</th>
                        ))}
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">Mean score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {groups.map((g) => (
                        <tr key={g.group}>
                          <th scope="row" className="px-4 py-2.5 font-semibold">{options[g.group] ?? g.group}</th>
                          <td className="px-4 py-2.5 text-right tabular-nums">{g.n}</td>
                          {c.stages.map((s) => {
                            const row = s.rates.find((x) => x.group === g.group)!;
                            return (
                              <td key={s.stage} className="px-4 py-2.5 text-right tabular-nums">
                                {row.rate === null ? (
                                  <span className="text-ink-3">Too few to compare</span>
                                ) : (
                                  <span className="inline-flex items-center gap-2">
                                    {pct(row.rate)}
                                    {row.flagged && <Badge tone="attention" title={`Impact ratio ${row.ratio?.toFixed(2)}`}>Check</Badge>}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-right tabular-nums">{c.meanScore[g.group] ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-8 text-sm text-ink-2" aria-labelledby="method-h">
        <h2 id="method-h" className="mb-2 text-base font-semibold">How this works</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>For each group we count the share of decided applicants who reached a stage. Undecided applications under a week old aren&apos;t counted.</li>
          <li>
            A <strong>Check</strong> flag means a group reached that stage at under {Math.round(FOUR_FIFTHS * 100)}% of the rate of the best-placed
            group, the common &ldquo;four-fifths&rdquo; rule of thumb. It&apos;s a prompt to look at the evidence, not proof of bias.
          </li>
          <li>Groups with fewer than {MIN_GROUP} applicants are hidden so nobody can be identified.</li>
          <li>Mean score shows whether a gap starts at grading or at later human decisions.</li>
        </ul>
      </section>
    </>
  );
}
