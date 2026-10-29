"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { IntakeAnswers, ScorecardDraft } from "@/providers/types";
import { createJobAction, previewScorecardAction } from "@/app/actions/jobs";
import { FormError, ScoreMeter } from "@/components/ui";

type Step = {
  key: keyof IntakeAnswers | "pay";
  question: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  optional?: boolean;
};

const STEPS: Step[] = [
  { key: "title", question: "What's the job title?", placeholder: "e.g. Home Caregiver, Warehouse Associate, Store Cashier" },
  { key: "location", question: "Where is the job based?", placeholder: "e.g. Koramangala, Bengaluru" },
  {
    key: "tasks",
    question: "What are the top three things this person does every day?",
    placeholder: "e.g. help with bathing, give medicines on time, keep daily notes",
    hint: "Separate tasks with commas.",
    multiline: true,
  },
  {
    key: "mustHaves",
    question: "Anything they must have from day one?",
    placeholder: "e.g. two-wheeler licence, night shifts, first aid certificate",
    hint: "Licences, availability, certificates. Leave blank if none.",
    multiline: true,
    optional: true,
  },
  { key: "pay", question: "What's the monthly pay range in rupees?" },
  { key: "shifts", question: "What shifts or hours?", placeholder: "e.g. 8 am–8 pm, 6 days a week, rotating nights" },
];

type Draft = Partial<IntakeAnswers>;

function answerText(step: Step, d: Draft): string {
  if (step.key === "pay") return `₹${(d.payMin ?? 0).toLocaleString("en-IN")} – ₹${(d.payMax ?? 0).toLocaleString("en-IN")} per month`;
  const v = d[step.key];
  return typeof v === "string" && v.trim() ? v : "None";
}

export function IntakeChat() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [value, setValue] = useState("");
  const [pay, setPay] = useState({ min: "", max: "" });
  const [localError, setLocalError] = useState<string>();
  const [preview, setPreview] = useState<ScorecardDraft | null>(null);
  const [serverError, setServerError] = useState<string>();
  const [creating, startCreate] = useTransition();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = step >= STEPS.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    const current = STEPS[step];
    let next: Draft;
    if (current.key === "pay") {
      const min = Number(pay.min.replace(/[,\s₹]/g, ""));
      const max = Number(pay.max.replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return setLocalError("Enter both amounts as numbers.");
      if (max < min) return setLocalError("The maximum should be at least the minimum.");
      next = { ...draft, payMin: Math.round(min), payMax: Math.round(max) };
    } else {
      const text = value.trim();
      if (!text && !current.optional) return setLocalError("Please answer to continue.");
      next = { ...draft, [current.key]: text };
    }
    setLocalError(undefined);
    setDraft(next);
    setValue("");
    setStep(step + 1);
    if (next.title) setPreview(await previewScorecardAction(next));
  }

  function back() {
    if (step === 0) return;
    const prev = STEPS[step - 1];
    if (prev.key === "pay") setPay({ min: String(draft.payMin ?? ""), max: String(draft.payMax ?? "") });
    else setValue(String(draft[prev.key] ?? ""));
    setStep(step - 1);
  }

  function create() {
    setServerError(undefined);
    startCreate(async () => {
      const result = await createJobAction(draft as IntakeAnswers);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
      <section className="panel flex flex-col" aria-label="Role intake">
        <ol className="flex-1 space-y-4 p-5" aria-live="polite">
          {STEPS.slice(0, Math.min(step + 1, STEPS.length)).map((s, i) => (
            <li key={s.key} className="space-y-2">
              <p className="max-w-[85%] rounded-lg rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-ink">{s.question}</p>
              {i < step && (
                <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3.5 py-2.5 text-on-primary">
                  {answerText(s, draft)}
                </p>
              )}
            </li>
          ))}
          {done && (
            <li>
              <p className="max-w-[85%] rounded-lg rounded-tl-sm bg-surface-2 px-3.5 py-2.5">
                That&apos;s everything. Check the scorecard, then create the draft. Nothing is published until you choose to.
              </p>
            </li>
          )}
        </ol>

        <div className="border-t border-line p-4">
          {!done ? (
            <form onSubmit={submitAnswer} className="space-y-2">
              {STEPS[step].key === "pay" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="payMin" className="label">Minimum (₹/month)</label>
                    <input id="payMin" ref={inputRef} inputMode="numeric" className="field tnum" placeholder="15000" value={pay.min} onChange={(e) => setPay({ ...pay, min: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="payMax" className="label">Maximum (₹/month)</label>
                    <input id="payMax" inputMode="numeric" className="field tnum" placeholder="22000" value={pay.max} onChange={(e) => setPay({ ...pay, max: e.target.value })} />
                  </div>
                </div>
              ) : (
                <>
                  <label htmlFor="answer" className="sr-only">{STEPS[step].question}</label>
                  {STEPS[step].multiline ? (
                    <textarea id="answer" ref={inputRef} rows={3} className="field resize-y" placeholder={STEPS[step].placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                  ) : (
                    <input id="answer" ref={inputRef} className="field" placeholder={STEPS[step].placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                  )}
                </>
              )}
              {STEPS[step].hint && <p className="hint">{STEPS[step].hint}</p>}
              {localError && <p className="error-text" role="alert">{localError}</p>}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={back} disabled={step === 0}>Back</button>
                <span className="tnum text-sm text-ink-3">{step + 1} of {STEPS.length}</span>
                <button type="submit" className="btn-primary">{STEPS[step].optional && !value.trim() ? "Skip" : "Next"}</button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <FormError message={serverError} />
              <div className="flex justify-between gap-2">
                <button type="button" className="btn-ghost" onClick={back}>Back</button>
                <button type="button" className="btn-primary" onClick={create} disabled={creating}>
                  {creating ? "Creating draft…" : "Create draft job"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="panel p-5 lg:sticky lg:top-8 lg:self-start" aria-label="Scorecard preview">
        <h2 className="font-semibold">Scorecard</h2>
        {!preview ? (
          <p className="mt-2 text-sm text-ink-3">Starts filling in after you give the job title.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-3">Every applicant is scored 0–4 on each skill. Weights decide how much each skill counts.</p>
            <ul className="mt-4 space-y-3">
              {preview.skills.map((s) => (
                <li key={s.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{s.name}</span>
                    <span className="tnum text-sm font-semibold text-primary">{s.weight}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${s.weight}%` }} />
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{s.description}</p>
                </li>
              ))}
            </ul>
            {preview.mustHaves.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold">Must-haves</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                  {preview.mustHaves.map((m) => (
                    <li key={m.label}>{m.label}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="mt-5 text-sm font-semibold">Applicants will answer</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-2">
              {preview.questions.map((q) => (
                <li key={q.prompt}>{q.prompt}</li>
              ))}
            </ol>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
              <ScoreMeter score={3} label="Example" /> 3 of 4 means clear evidence in their own words.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
