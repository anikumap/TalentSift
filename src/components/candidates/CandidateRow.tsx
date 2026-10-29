import Link from "next/link";
import type { ShortlistRow } from "@/services/applications";
import { Badge, ScoreMeter, StageBadge, TotalScore } from "@/components/ui";
import { DecisionButtons } from "./DecisionButtons";
import { RetryButton } from "./RetryButton";

export function CandidateRow({ row, rank, canDecide }: { row: ShortlistRow; rank?: number; canDecide: boolean }) {
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2 md:grid-cols-[2rem_minmax(160px,1.2fr)_5.5rem_minmax(220px,2fr)_4.5rem] [&::-webkit-details-marker]:hidden">
          <span className="tnum hidden text-sm text-ink-3 md:block">{rank ?? ""}</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{row.displayName}</span>
            <span className="mt-0.5 flex flex-wrap gap-1">
              <StageBadge stage={row.stage} />
              {!row.mustHavesMet && (
                <Badge tone="attention" title={row.missedMustHaves.join(", ")}>
                  Missing {row.mustHavesMissed} must-have{row.mustHavesMissed > 1 ? "s" : ""}
                </Badge>
              )}
              {row.injectionFlags.length > 0 && (
                <Badge tone="reject" title="The answers contain text that tries to influence the AI. Scores ignore it; read the answers yourself.">
                  Check answers
                </Badge>
              )}
            </span>
          </span>
          <span className="justify-self-end md:justify-self-start">
            {row.evalStatus === "DONE" ? <TotalScore value={row.totalScore} /> : <Badge tone="attention">{row.evalStatus === "FAILED" ? "Not scored" : "Scoring"}</Badge>}
          </span>
          <span className="col-span-3 grid grid-cols-1 gap-1 sm:grid-cols-2 md:col-span-1">
            {row.skills.map((s) => (
              <span key={s.skillId} className="flex items-center justify-between gap-2 text-xs text-ink-2">
                <span className="truncate">{s.name}</span>
                <ScoreMeter score={s.score} label={s.name} />
              </span>
            ))}
          </span>
          <span className="hidden text-sm font-semibold text-primary group-open:hidden md:block">Evidence</span>
          <span className="hidden text-sm font-semibold text-ink-3 md:group-open:block">Close</span>
        </summary>

        <div className="border-t border-line bg-paper px-4 py-4 md:pl-16">
          <p className="max-w-[75ch] text-ink">{row.why}</p>
          {row.evalStatus === "FAILED" && <RetryButton appId={row.appId} jobId={row.jobId} />}
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            {row.skills.map((s) => (
              <div key={s.skillId}>
                <dt className="flex items-center gap-2 text-sm font-semibold">
                  {s.name}
                  <span className="tnum font-normal text-ink-3">
                    {s.score}/4 · {s.weight}%
                  </span>
                </dt>
                <dd className="mt-1 space-y-1 text-sm text-ink-2">
                  {s.evidence.length === 0 ? (
                    <p className="text-ink-3">No evidence for this skill in the answers.</p>
                  ) : (
                    s.evidence.map((q, i) => (
                      <p key={i}>
                        “<span className="evidence">{q}</span>”
                      </p>
                    ))
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {canDecide ? <DecisionButtons appId={row.appId} jobId={row.jobId} stage={row.stage} /> : <span />}
            <Link href={`/candidates/${row.appId}`} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
              Full application
            </Link>
          </div>
        </div>
      </details>
    </li>
  );
}
