import Link from "next/link";
import { requireActor } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { listAudit } from "@/services/dashboard";
import { listJobs } from "@/services/jobs";
import { AUDIT_ACTIONS } from "@/domain/constants";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

const ACTION_LABELS: Record<string, string> = {
  SCORECARD_UPDATED: "Scorecard updated",
  JOB_PUBLISHED: "Job published",
  JOB_CLOSED: "Job closed",
  APPLICATION_SUBMITTED: "Application submitted",
  EVALUATION_CREATED: "Evaluation created",
  STAGE_CHANGED: "Stage changed",
  IDENTITY_REVEALED: "Identity revealed",
  MEMBER_INVITED: "Member invited",
  PLAN_CHANGED: "Plan changed",
  RETENTION_CHANGED: "Retention changed",
  RETENTION_PURGE: "Old candidate data erased",
};

function summarize(json: string | null): string {
  if (!json) return "";
  const v = JSON.parse(json) as Record<string, unknown>;
  return Object.entries(v)
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.map((x) => (typeof x === "object" ? Object.values(x as object).join(" ") : x)).join(", ") : String(val)}`)
    .join("; ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; jobId?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [events, jobs] = await Promise.all([listAudit(actor, sp), listJobs(actor)]);
  const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every score, decision and setting change, with who made it and why. Entries can't be edited or deleted."
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter audit log">
        <div>
          <label htmlFor="action" className="label">Action</label>
          <select id="action" name="action" defaultValue={sp.action ?? ""} className="field h-9 py-1">
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jobId" className="label">Job</label>
          <select id="jobId" name="jobId" defaultValue={sp.jobId ?? ""} className="field h-9 py-1">
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
        {(sp.action || sp.jobId) && <Link href="/settings/audit" className="btn-ghost">Clear</Link>}
      </form>

      {events.length === 0 ? (
        <EmptyState title="No matching entries" body="Try a different filter." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Who</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Action</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Job</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{dateTime(e.createdAt)}</td>
                  <td className="px-4 py-2.5">{e.actorName ?? <span className="text-ink-3">Candidate / system</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="px-4 py-2.5 text-ink-2">{e.jobId ? jobTitle.get(e.jobId) ?? "—" : "—"}</td>
                  <td className="max-w-[420px] px-4 py-2.5 text-ink-2">
                    {e.reason && <p><span className="text-ink-3">Reason:</span> {e.reason}</p>}
                    {e.before && <p><span className="text-ink-3">Before:</span> {summarize(e.before)}</p>}
                    {e.after && <p><span className="text-ink-3">After:</span> {summarize(e.after)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
