"use client";

import { useEffect, useState, useTransition } from "react";
import { saveDetailsAction } from "@/app/actions/jobs";
import { FormError, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Question = { id?: string; prompt: string; skillIds: string[] };

export function QuestionsEditor({
  jobId,
  questions: initial,
  skills,
  editable,
}: {
  jobId: string;
  questions: Question[];
  skills: { id: string; name: string }[];
  editable: boolean;
}) {
  const [questions, setQuestions] = useState(initial);
  const [state, setState] = useState<ActionState>(null);
  const [saving, start] = useTransition();

  useEffect(() => setQuestions(initial), [initial]);

  const update = (i: number, patch: Partial<Question>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const toggleSkill = (i: number, id: string) => {
    const q = questions[i];
    update(i, { skillIds: q.skillIds.includes(id) ? q.skillIds.filter((s) => s !== id) : [...q.skillIds, id] });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Work-sample questions</h2>
      <p className="max-w-[65ch] text-sm text-ink-3">
        Real situations from the job. Each answer is scored against the skills you tick, and the sentences that show the skill are quoted as evidence.
      </p>
      <ol className="mt-4 space-y-3">
        {questions.map((q, i) => (
          <li key={q.id ?? `new-${i}`} className="panel p-4">
            <label className="label" htmlFor={`q-${i}`}>Question {i + 1}</label>
            <textarea id={`q-${i}`} rows={2} className="field resize-y" value={q.prompt} readOnly={!editable} onChange={(e) => update(i, { prompt: e.target.value })} />
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold">Shows these skills</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {skills.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-[var(--primary)]" checked={q.skillIds.includes(s.id)} disabled={!editable} onChange={() => toggleSkill(i, s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {editable && questions.length > 1 && (
              <button type="button" className="btn-ghost mt-2 px-0 text-reject" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>
                Remove question
              </button>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {questions.length < 5 && (
            <button type="button" className="btn-secondary" onClick={() => setQuestions([...questions, { prompt: "", skillIds: skills.slice(0, 1).map((s) => s.id) }])}>
              Add question
            </button>
          )}
          <button type="button" className="btn-primary" disabled={saving} onClick={() => start(async () => setState(await saveDetailsAction(jobId, { questions })))}>
            {saving ? "Saving…" : "Save questions"}
          </button>
          {state?.ok && <Notice tone="ok">Questions saved.</Notice>}
          <FormError message={state?.error} />
        </div>
      )}
    </div>
  );
}
