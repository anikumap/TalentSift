import Link from "next/link";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { date } from "@/lib/format";
import { listJobs } from "@/services/jobs";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { JobStatus } from "@/domain/constants";

export const metadata = { title: "Jobs" };

const STATUS: Record<JobStatus, { label: string; tone: "neutral" | "ok" | "attention" }> = {
  DRAFT: { label: "Draft", tone: "attention" },
  OPEN: { label: "Open", tone: "ok" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export default async function JobsPage() {
  const actor = await requireActor();
  const jobs = await listJobs(actor);
  const canCreate = can(actor.role, "job.edit");

  return (
    <>
      <PageHeader
        title="Jobs"
        actions={canCreate && <Link href="/jobs/new" className="btn-primary">Create a job</Link>}
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="Create your first job"
          body="Answer six questions about the role and TalentSift drafts the scorecard, the job ad and the screening questions."
          action={canCreate ? { href: "/jobs/new", label: "Create a job" } : undefined}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Job</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Applicants</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${j.id}`} className="font-semibold text-ink hover:text-primary">
                      {j.title}
                    </Link>
                    <span className="block text-ink-3">{j.location}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
                  </td>
                  <td className="tnum px-4 py-3 text-right">
                    {j.applicants > 0 ? (
                      <Link href={`/jobs/${j.id}/candidates`} className="font-semibold text-primary hover:underline">
                        {j.applicants}
                      </Link>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{date(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
