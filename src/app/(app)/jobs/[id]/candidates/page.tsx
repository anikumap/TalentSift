import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { getJob } from "@/services/jobs";
import { listShortlist } from "@/services/applications";
import { STAGES, STAGE_LABELS, type Stage } from "@/domain/constants";
import { EmptyState, PageHeader } from "@/components/ui";
import { CandidateRow } from "@/components/candidates/CandidateRow";
import { JobNav } from "../JobNav";

export const metadata = { title: "Shortlist" };

export default async function ShortlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mustHaves?: string; minScore?: string; stage?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const job = await getJob(actor, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const minScore = sp.minScore ? Math.max(0, Math.min(100, Number(sp.minScore) || 0)) : undefined;
  const stage = (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : undefined;
  const rows = await listShortlist(actor, id, { mustHavesMet: sp.mustHaves === "met", minScore, stage });
  const filtered = sp.mustHaves === "met" || minScore !== undefined || stage !== undefined;

  return (
    <>
      <PageHeader
        title={job.title}
        description="Ranked by evidence in each applicant's own answers. Names stay hidden until you shortlist someone."
      />
      <JobNav jobId={job.id} active="candidates" applicants={job.applicants} />

      <form className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter candidates">
        <div>
          <label htmlFor="stage" className="label">Stage</label>
          <select id="stage" name="stage" defaultValue={stage ?? ""} className="field h-9 py-1">
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="minScore" className="label">Minimum score</label>
          <input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={minScore ?? ""} placeholder="0" className="field tnum h-9 w-24 py-1" />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="mustHaves" value="met" defaultChecked={sp.mustHaves === "met"} className="accent-[var(--primary)]" />
          Meets all must-haves
        </label>
        <button type="submit" className="btn-secondary">Apply filters</button>
        {filtered && (
          <Link href={`/jobs/${id}/candidates`} className="btn-ghost">Clear</Link>
        )}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="No candidates match these filters" body="Loosen the filters to see more people." />
        ) : (
          <EmptyState
            title="No applicants yet"
            body={job.status === "OPEN" ? "Share the apply link from the Setup tab. Each applicant appears here, scored, as soon as they finish." : "Publish this job to get an apply link."}
            action={{ href: `/jobs/${id}`, label: job.status === "OPEN" ? "Get the apply link" : "Go to setup" }}
          />
        )
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden" aria-label="Ranked candidates">
          {rows.map((r, i) => (
            <CandidateRow key={r.appId} row={r} rank={i + 1} canDecide={can(actor.role, "stage.change")} />
          ))}
        </ul>
      )}
    </>
  );
}
