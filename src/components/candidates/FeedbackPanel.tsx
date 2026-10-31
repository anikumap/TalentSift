"use client";

import { useActionState } from "react";
import { submitFeedbackAction } from "@/app/actions/interviews";
import { RECOMMENDATIONS, RECOMMENDATION_LABELS, type Recommendation } from "@/domain/constants";
import { istDateTime } from "@/domain/interviews";
import { Badge, FormError, Notice, ScoreMeter } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export const RATING_LABELS = ["None", "Weak", "Some", "Good", "Strong"] as const;

export type PanelFeedback = {
  interviewId: string;
  interviewerId: string;
  interviewerName: string;
  startsAt: string;
  recommendation: Recommendation;
  notes: string;
  ratings: { skillId: string; name: string; rating: number }[];
};

const REC_TONE: Record<Recommendation, "ok" | "primary" | "attention" | "reject"> = {
  STRONG_YES: "ok",
  YES: "primary",
  NO: "attention",
  STRONG_NO: "reject",
};

function FeedbackForm({ appId, interviewId, startsAt, skills }: { appId: string; interviewId: string; startsAt: string; skills: { id: string; name: string }[] }) {
  const [state, action] = useActionState(submitFeedbackAction.bind(null, appId, interviewId), null);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="panel space-y-5 p-4" aria-label={`Feedback for the interview on ${istDateTime(new Date(startsAt))}`}>
      <p className="text-sm text-ink-2">
        Your interview on <span className="font-semibold">{istDateTime(new Date(startsAt))}</span>. Rate what you saw, not the written answers.
        You&apos;ll see other interviewers&apos; feedback after you submit, and it can&apos;t be edited afterwards.
      </p>
      {skills.map((s) => (
        <fieldset key={s.id}>
          <legend className="mb-1.5 font-semibold">{s.name}</legend>
          <div className="flex flex-wrap gap-1.5">
            {RATING_LABELS.map((label, value) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name={`rating_${s.id}`} value={value} className="peer sr-only" required />
                <span className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                  {label}
                </span>
              </label>
            ))}
          </div>
          {f[`rating_${s.id}`] && <p className="error-text">{f[`rating_${s.id}`]}</p>}
        </fieldset>
      ))}
      <div>
        <label htmlFor={`rec-${interviewId}`} className="label">Recommendation</label>
        <select id={`rec-${interviewId}`} name="recommendation" className="field" required defaultValue="">
          <option value="" disabled>Choose one</option>
          {RECOMMENDATIONS.map((r) => (
            <option key={r} value={r}>{RECOMMENDATION_LABELS[r]}</option>
          ))}
        </select>
        {f.recommendation && <p className="error-text">{f.recommendation}</p>}
      </div>
      <div>
        <label htmlFor={`notes-${interviewId}`} className="label">Notes <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea id={`notes-${interviewId}`} name="notes" rows={4} maxLength={2000} className="field" placeholder="What did they say or do that shaped your ratings?" />
        {f.notes && <p className="error-text">{f.notes}</p>}
      </div>
      <FormError message={state?.error} />
      <SubmitButton pendingText="Submitting…">Submit feedback</SubmitButton>
    </form>
  );
}

export function FeedbackPanel({
  appId,
  actorId,
  skills,
  graderScores,
  mineDue,
  visible,
  hiddenCount,
}: {
  appId: string;
  actorId: string;
  skills: { id: string; name: string }[];
  graderScores: Record<string, number>;
  mineDue: { interviewId: string; startsAt: string }[];
  visible: PanelFeedback[];
  hiddenCount: number;
}) {
  const submittedMine = visible.some((v) => v.interviewerId === actorId);
  return (
    <section id="feedback" aria-labelledby="fb-h" className="scroll-mt-20">
      <h2 id="fb-h" className="text-lg font-semibold">Interview feedback</h2>
      <div className="mt-3 space-y-4">
        {submittedMine && mineDue.length === 0 && <Notice tone="ok">Your feedback is in.</Notice>}
        {mineDue.map((d) => (
          <FeedbackForm key={d.interviewId} appId={appId} interviewId={d.interviewId} startsAt={d.startsAt} skills={skills} />
        ))}
        {hiddenCount > 0 && (
          <p className="text-sm text-ink-2">
            {hiddenCount === 1 ? "1 interviewer has" : `${hiddenCount} interviewers have`} submitted feedback. You&apos;ll see it once yours is in.
          </p>
        )}
        {visible.length === 0 && hiddenCount === 0 && mineDue.length === 0 && <p className="text-sm text-ink-3">No feedback yet.</p>}
        {visible.map((v) => (
          <article key={v.interviewId} className="panel p-4" aria-label={`Feedback from ${v.interviewerName}`}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{v.interviewerName}</span>
                <span className="text-sm text-ink-3"> · {istDateTime(new Date(v.startsAt))}</span>
              </span>
              <Badge tone={REC_TONE[v.recommendation]}>{RECOMMENDATION_LABELS[v.recommendation]}</Badge>
            </header>
            <table className="mt-3 w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Skill</th>
                  <th>Interviewer</th>
                  <th>Grader</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {v.ratings.map((r) => (
                  <tr key={r.skillId}>
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3">
                      <span className="flex items-center gap-2">
                        <ScoreMeter score={r.rating} label={`${v.interviewerName} on ${r.name}`} />
                        <span className="text-ink-2">{RATING_LABELS[r.rating]}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-xs text-ink-3">
                      {graderScores[r.skillId] !== undefined ? <>Grader {graderScores[r.skillId]}/4</> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.notes && <p className="mt-3 whitespace-pre-line text-sm text-ink-2">{v.notes}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
