"use client";

import { useEffect, useRef, useState } from "react";
import { FormError, cx } from "@/components/ui";
import { SELF_ID, SELF_ID_KEYS, type SelfIdKey } from "@/domain/selfid";

type Job = {
  title: string;
  orgName: string;
  shifts: string;
  adText: string;
  mustHaves: { id: string; question: string }[];
  questions: { id: string; prompt: string }[];
};

const ANSWER_MAX = 1000;
const RESUME_MAX = 5 * 1024 * 1024;
const STEP_NAMES = ["About the job", "Your details", "Requirements", "Situations", "Resume"];

export function ApplyFlow({ slug, job }: { slug: string; job: Job }) {
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", city: "" });
  const [mustHaves, setMustHaves] = useState<Record<string, boolean | undefined>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resume, setResume] = useState<File | null>(null);
  const [selfId, setSelfId] = useState<Partial<Record<SelfIdKey, string>>>({});
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [publicRef, setPublicRef] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  // Move focus to the new step's heading for screen readers — but not on first load.
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step, publicRef]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (step === 0 && !consent) e.consent = "Please agree so we can review your application.";
    if (step === 1) {
      if (contact.name.trim().length < 2) e.name = "Enter your full name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) e.email = "Enter a valid email address.";
      if (contact.phone.replace(/\D/g, "").length < 8) e.phone = "Enter a phone number we can call.";
      if (contact.city.trim().length < 2) e.city = "Enter your city.";
    }
    if (step === 2) for (const m of job.mustHaves) if (mustHaves[m.id] === undefined) e[m.id] = "Choose yes or no.";
    if (step === 3) {
      for (const q of job.questions) {
        const a = (answers[q.id] ?? "").trim();
        if (a.length < 10) e[q.id] = "Write a few sentences — there are no wrong answers.";
      }
    }
    if (step === 4 && resume) {
      if (!/\.(pdf|txt)$/i.test(resume.name)) e.resume = "Upload a PDF or .txt file.";
      else if (resume.size > RESUME_MAX) e.resume = "The file is larger than 5 MB.";
    }
    return e;
  }

  async function next(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setError(undefined);
    if (step < 4) return setStep(step + 1);

    setSubmitting(true);
    const body = new FormData();
    body.set("consent", String(consent));
    for (const [k, v] of Object.entries(contact)) body.set(k, v);
    body.set("mustHaveAnswers", JSON.stringify(mustHaves));
    body.set("answers", JSON.stringify(answers));
    body.set("selfId", JSON.stringify(Object.fromEntries(Object.entries(selfId).filter(([, v]) => v))));
    if (resume) body.set("resume", resume);
    try {
      const res = await fetch(`/api/apply/${slug}`, { method: "POST", body });
      const data = (await res.json()) as { publicRef?: string; error?: string };
      if (!res.ok || !data.publicRef) setError(data.error ?? "Something went wrong. Please try again.");
      else setPublicRef(data.publicRef);
    } catch {
      setError("You seem to be offline. Check your connection and try again — your answers are saved on this page.");
    } finally {
      setSubmitting(false);
    }
  }

  if (publicRef) {
    return (
      <section className="panel p-6 text-center" aria-labelledby="done-h">
        <h2 id="done-h" ref={headingRef} tabIndex={-1} className="text-xl font-bold">
          Application sent
        </h2>
        <p className="mt-2 text-ink-2">
          Thank you, {contact.name.split(" ")[0]}. {job.orgName} will review your answers and reply by email to {contact.email}.
        </p>
        <p className="mt-4 text-sm text-ink-3">
          Your reference number is <strong className="tnum text-ink">{publicRef}</strong>.
        </p>
      </section>
    );
  }

  const fieldError = (key: string) =>
    fieldErrors[key] ? (
      <p id={`${key}-err`} className="error-text">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={next} noValidate>
      <div className="mb-5" aria-hidden="true">
        <div className="flex gap-1.5">
          {STEP_NAMES.map((n, i) => (
            <span key={n} className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-line")} />
          ))}
        </div>
      </div>
      <p className="tnum text-sm text-ink-3">
        Step {step + 1} of {STEP_NAMES.length}
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">
        {STEP_NAMES[step]}
      </h2>

      {step === 0 && (
        <div className="space-y-5">
          <div className="panel max-h-80 overflow-y-auto whitespace-pre-line p-4 text-[0.95rem] leading-relaxed text-ink-2">{job.adText}</div>
          <p className="text-ink-2">
            Applying takes about 2 minutes. You&apos;ll answer {job.questions.length} short questions about real situations from this job.
          </p>
          <label className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-describedby={fieldErrors.consent ? "consent-err" : undefined}
            />
            <span className="text-sm">
              I agree that {job.orgName} can store my details and answers to review this application. My answers are scored
              against the job&apos;s skills to help a person decide — no one is rejected automatically. My name and contact
              details stay hidden from reviewers until they choose to contact me.
            </span>
          </label>
          {fieldError("consent")}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {(
            [
              ["name", "Full name", "text", "name"],
              ["email", "Email", "email", "email"],
              ["phone", "Mobile number", "tel", "tel"],
              ["city", "City or area you live in", "text", "address-level2"],
            ] as const
          ).map(([key, label, type, autoComplete]) => (
            <div key={key}>
              <label htmlFor={key} className="label">
                {label}
              </label>
              <input
                id={key}
                type={type}
                autoComplete={autoComplete}
                inputMode={key === "phone" ? "tel" : undefined}
                className="field h-12 text-base"
                value={contact[key]}
                onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                aria-invalid={!!fieldErrors[key]}
                aria-describedby={fieldErrors[key] ? `${key}-err` : undefined}
              />
              {fieldError(key)}
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {job.mustHaves.length === 0 && <p className="text-ink-2">No special requirements for this job.</p>}
          {job.mustHaves.map((m) => (
            <fieldset key={m.id} className="rounded-lg border border-line bg-surface p-4" aria-describedby={fieldErrors[m.id] ? `${m.id}-err` : undefined}>
              <legend className="sr-only">{m.question}</legend>
              <p className="font-medium">{m.question}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[true, false].map((v) => (
                  <label
                    key={String(v)}
                    className={cx(
                      "flex h-12 cursor-pointer items-center justify-center rounded-md border text-base font-semibold",
                      mustHaves[m.id] === v ? "border-primary bg-primary-soft text-primary" : "border-line text-ink-2",
                    )}
                  >
                    <input type="radio" className="sr-only" name={m.id} checked={mustHaves[m.id] === v} onChange={() => setMustHaves({ ...mustHaves, [m.id]: v })} />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
              {fieldError(m.id)}
            </fieldset>
          ))}
          {job.mustHaves.length > 0 && <p className="hint">Answer honestly. Saying no doesn&apos;t remove you — a person still reads your application.</p>}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <p className="text-ink-2">Write as you would explain it to a friend. Short, clear sentences are perfect. Any language mix is fine.</p>
          {job.questions.map((q, i) => (
            <div key={q.id}>
              <label htmlFor={q.id} className="block font-semibold">
                {i + 1}. {q.prompt}
              </label>
              <textarea
                id={q.id}
                rows={5}
                maxLength={ANSWER_MAX}
                className="field mt-2 text-base"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                aria-invalid={!!fieldErrors[q.id]}
                aria-describedby={`${q.id}-count${fieldErrors[q.id] ? ` ${q.id}-err` : ""}`}
              />
              <p id={`${q.id}-count`} className="tnum mt-1 text-right text-xs text-ink-3">
                {(answers[q.id] ?? "").length}/{ANSWER_MAX}
              </p>
              {fieldError(q.id)}
            </div>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-ink-2">Optional. If you have a resume, add it — otherwise just send your application.</p>
          <label htmlFor="resume" className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-line bg-surface p-6 text-center">
            <span className="font-semibold text-primary">{resume ? resume.name : "Choose a file"}</span>
            <span className="text-sm text-ink-3">PDF or .txt, up to 5 MB</span>
            <input id="resume" type="file" accept=".pdf,.txt,application/pdf,text/plain" className="sr-only" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
          </label>
          {resume && (
            <button type="button" className="btn-ghost" onClick={() => setResume(null)}>
              Remove file
            </button>
          )}
          {fieldError("resume")}

          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 font-semibold">About you (optional)</legend>
            <p className="text-sm text-ink-3">
              These answers are never shown to anyone reviewing your application and don&apos;t affect your score. We only use
              them as totals to check our hiring is fair. Skip any you like.
            </p>
            {SELF_ID_KEYS.map((key) => (
              <div key={key}>
                <label htmlFor={`self-${key}`} className="label">{SELF_ID[key].label}</label>
                <select
                  id={`self-${key}`}
                  className="field"
                  value={selfId[key] ?? ""}
                  onChange={(e) => setSelfId({ ...selfId, [key]: e.target.value })}
                >
                  <option value="">Prefer not to say</option>
                  {Object.entries(SELF_ID[key].options).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <FormError message={error} />
        <div className="flex gap-3">
          {step > 0 && (
            <button type="button" className="btn-secondary btn-lg" onClick={() => setStep(step - 1)} disabled={submitting}>
              Back
            </button>
          )}
          <button type="submit" className="btn-primary btn-lg flex-1" disabled={submitting}>
            {step < 4 ? "Continue" : submitting ? "Sending…" : "Send application"}
          </button>
        </div>
      </div>
    </form>
  );
}
