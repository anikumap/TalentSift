import Link from "next/link";
import { requireActor } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import { listAllApplications } from "@/services/applications";
import { STAGES, STAGE_LABELS, type Stage } from "@/domain/constants";
import { Badge, EmptyState, PageHeader, StageBadge, cx } from "@/components/ui";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const stage = (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : undefined;
  const rows = await listAllApplications(actor, { stage });

  return (
    <>
      <PageHeader title="Candidates" description="Everyone who applied to any of your jobs, newest first." />
      <nav aria-label="Filter by stage" className="mb-4 flex flex-wrap gap-1">
        {[undefined, ...STAGES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/candidates?stage=${s}` : "/candidates"}
            aria-current={stage === s ? "page" : undefined}
            className={cx("rounded-md px-2.5 py-1 text-sm font-medium", stage === s ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2")}
          >
            {s ? STAGE_LABELS[s] : "All"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No candidates here" body={stage ? "Nobody is in this stage right now." : "Publish a job and share its apply link to start receiving applications."} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Candidate</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Job</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Score</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.appId} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${r.appId}`} className="font-semibold hover:text-primary">{r.displayName}</Link>
                    {!r.mustHavesMet && <span className="ml-2"><Badge tone="attention">Must-have missing</Badge></span>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{r.jobTitle}</td>
                  <td className="tnum px-4 py-3 text-right font-semibold">{r.evalStatus === "DONE" ? r.totalScore : "—"}</td>
                  <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                  <td className="px-4 py-3 text-ink-2">{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
