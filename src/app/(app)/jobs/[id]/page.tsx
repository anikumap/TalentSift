import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { payRange } from "@/lib/format";
import { getJob } from "@/services/jobs";
import { Badge, cx, PageHeader } from "@/components/ui";
import { JobNav } from "./JobNav";
import { JobStatusControls } from "./JobStatusControls";
import { ScorecardEditor } from "./ScorecardEditor";
import { AdEditor } from "./AdEditor";
import { QuestionsEditor } from "./QuestionsEditor";

export const metadata = { title: "Job" };

const SECTIONS = [
  { key: "scorecard", label: "Scorecard" },
  { key: "ad", label: "Job ad" },
  { key: "questions", label: "Work-sample questions" },
] as const;

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { section = "scorecard" } = await searchParams;
  const job = await getJob(actor, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const editable = can(actor.role, "job.edit");
  const applyUrl = `${process.env.APP_URL ?? ""}/apply/${job.slug}`;

  return (
    <>
      <PageHeader
        title={job.title}
        description={
          <>
            {job.location} · {payRange(job.payMin, job.payMax)} · {job.shifts}
          </>
        }
        actions={
          <Badge tone={job.status === "OPEN" ? "ok" : job.status === "DRAFT" ? "attention" : "neutral"}>
            {job.status === "OPEN" ? "Open" : job.status === "DRAFT" ? "Draft" : "Closed"}
          </Badge>
        }
      />
      <JobNav jobId={job.id} active="overview" applicants={job.applicants} />

      <JobStatusControls
        jobId={job.id}
        status={job.status}
        applyUrl={applyUrl}
        applyPath={`/apply/${job.slug}`}
        canPublish={can(actor.role, "job.publish")}
        flagCount={job.wordingFlags.length}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Job setup" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={`/jobs/${job.id}?section=${s.key}`}
              aria-current={section === s.key ? "page" : undefined}
              className={cx(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                section === s.key ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {s.label}
              {s.key === "ad" && job.wordingFlags.length > 0 && (
                <span className="tnum ml-2 rounded bg-attention-soft px-1.5 text-xs font-semibold text-attention">{job.wordingFlags.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "ad" ? (
            <AdEditor jobId={job.id} adText={job.adText} skillNames={job.skills.map((s) => s.name)} editable={editable} />
          ) : section === "questions" ? (
            <QuestionsEditor jobId={job.id} questions={job.questions} skills={job.skills} editable={editable} />
          ) : (
            <ScorecardEditor jobId={job.id} skills={job.skills} mustHaves={job.mustHaves} editable={editable} />
          )}
        </div>
      </div>
    </>
  );
}
