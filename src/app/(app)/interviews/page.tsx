import Link from "next/link";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listMyInterviews, type InterviewRow } from "@/services/interviews";
import { INTERVIEW_MODE_LABELS } from "@/domain/constants";
import { istDateTime } from "@/domain/interviews";
import { EmptyState, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "Interviews" };

function Rows({ rows, due, showInterviewer }: { rows: InterviewRow[]; due?: boolean; showInterviewer: boolean }) {
  return (
    <ul className="panel divide-y divide-line">
      {rows.map((r) => (
        <li key={r.interviewId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <span className="tnum w-44 font-semibold">{istDateTime(r.startsAt)}</span>
          <Link
            href={`/candidates/${r.appId}${due ? "#feedback" : ""}`}
            className="min-w-40 flex-1 font-semibold text-primary underline-offset-2 hover:underline"
          >
            {r.displayName}
          </Link>
          <span className="text-ink-2">{r.jobTitle}</span>
          <span className="text-ink-3">
            {INTERVIEW_MODE_LABELS[r.mode]}
            {showInterviewer && <> · {r.interviewerName}</>}
          </span>
          {due ? (
            <Link href={`/candidates/${r.appId}#feedback`} className="btn-primary h-8">
              Give feedback
            </Link>
          ) : (
            <a href={`/api/interviews/${r.interviewId}/ics`} className="text-ink-2 underline-offset-2 hover:underline">
              .ics
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const actor = await requireActor();
  const manage = can(actor.role, "interview.manage");
  // Deciders see everyone's interviews by default, with a "Mine only" view; interviewers only ever see their own.
  const showAll = manage && (await searchParams).mine !== "1";
  const { upcoming, feedbackDue } = await listMyInterviews(actor, { mineOnly: !showAll });

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Your upcoming interviews and the ones waiting for your feedback. Times are India time."
        actions={
          manage ? (
            <nav aria-label="Whose interviews" className="flex gap-1 rounded-md border border-line p-0.5 text-sm">
              {[
                { href: "/interviews", label: "Everyone's", on: showAll },
                { href: "/interviews?mine=1", label: "Mine only", on: !showAll },
              ].map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  aria-current={t.on ? "page" : undefined}
                  className={cx("rounded px-3 py-1 font-semibold", t.on ? "bg-primary-soft text-primary" : "text-ink-2 hover:text-ink")}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          ) : undefined
        }
      />
      {feedbackDue.length > 0 && (
        <section aria-labelledby="due-h" className="mb-8">
          <h2 id="due-h" className="mb-2 text-lg font-semibold">
            Feedback due <span className="font-normal text-ink-3">· {feedbackDue.length}</span>
          </h2>
          <Rows rows={feedbackDue} due showInterviewer={false} />
        </section>
      )}
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="mb-2 text-lg font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            body={manage ? "Add interview times on a job's Interviews tab, then move candidates to Interview so they can book." : "When someone books a time with you, it shows up here."}
          />
        ) : (
          <Rows rows={upcoming} showInterviewer={showAll} />
        )}
      </section>
    </>
  );
}
