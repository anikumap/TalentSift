import Link from "next/link";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { describeAudit, timeAgo } from "@/lib/format";
import { getDashboard } from "@/services/dashboard";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireActor();
  const d = await getDashboard(actor);
  const canCreate = can(actor.role, "job.edit");

  return (
    <>
      <PageHeader
        title={`Hello, ${actor.name.split(" ")[0]}`}
        actions={canCreate && <Link href="/jobs/new" className="btn-primary">Create a job</Link>}
      />

      {d.waitingOnYou > 0 && (
        <Link
          href="/candidates?stage=APPLIED"
          className="mb-6 flex items-center justify-between gap-4 rounded-lg bg-attention-soft px-4 py-3 text-attention hover:brightness-[0.98]"
        >
          <span>
            <strong className="tnum">{d.waitingOnYou}</strong> candidate{d.waitingOnYou === 1 ? " has" : "s have"} been waiting
            more than 2 days for a decision.
          </span>
          <span className="font-semibold underline underline-offset-2">Review</span>
        </Link>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="open-jobs">
          <h2 id="open-jobs" className="mb-3 text-base font-semibold">
            Open jobs
          </h2>
          {d.openJobs.length === 0 ? (
            <EmptyState
              title="No open jobs yet"
              body="Create a job, publish it, and share the apply link. Applicants show up here as they finish."
              action={canCreate ? { href: "/jobs/new", label: "Create a job" } : undefined}
            />
          ) : (
            <ul className="panel divide-y divide-line">
              {d.openJobs.map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}/candidates`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{j.title}</span>
                      <span className="block text-sm text-ink-3">{j.location}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="tnum block font-semibold">{j.applicants} applicants</span>
                      {j.newToday > 0 && <span className="tnum block text-primary">{j.newToday} new today</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity">
          <h2 id="activity" className="mb-3 text-base font-semibold">
            Recent activity
          </h2>
          {d.recentActivity.length === 0 ? (
            <p className="text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {d.recentActivity.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-ink">{describeAudit(e)}</span>
                  <span className="block text-ink-3">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
