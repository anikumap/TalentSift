"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookByTokenAction, cancelByTokenAction } from "@/app/actions/interviews";
import { INTERVIEW_MODE_LABELS, type InterviewMode } from "@/domain/constants";
import { istDay, istDayKey, istDateTime, istTime } from "@/domain/interviews";
import { FormError, Notice, cx } from "@/components/ui";

type Slot = { id: string; startsAt: string; durationMin: number; mode: InterviewMode };
type Booked = { id: string; startsAt: string; durationMin: number; mode: InterviewMode; location: string; canChange: boolean; started: boolean };

export function BookingFlow({ token, slots, booked }: { token: string; slots: Slot[]; booked: Booked | null }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string } | null>) =>
    start(async () => {
      const r = await fn();
      setError(r?.error);
      setPicked("");
      if (!r?.error) setChanging(false);
      // Refresh either way: after losing a race for a time, the list must show what's still free.
      router.refresh();
    });

  if (booked && !changing) {
    const when = new Date(booked.startsAt);
    return (
      <section aria-labelledby="booked-h" className="space-y-4">
        {booked.started ? (
          <Notice tone="primary">
            <h2 id="booked-h" className="font-semibold">Your interview time has passed</h2>
            <p className="mt-0.5">Thank you. The employer will be in touch by email about the next step.</p>
          </Notice>
        ) : (
          <Notice tone="ok">
            <h2 id="booked-h" className="font-semibold">You&apos;re booked</h2>
          </Notice>
        )}
        <dl className="panel space-y-3 p-4">
          <div>
            <dt className="text-sm text-ink-3">When (India time)</dt>
            <dd className="text-lg font-semibold">{istDateTime(when)}</dd>
            <dd className="text-sm text-ink-2">About {booked.durationMin} minutes</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-3">How</dt>
            <dd className="font-semibold">{INTERVIEW_MODE_LABELS[booked.mode]}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-3">Where</dt>
            <dd className="whitespace-pre-line font-semibold">{booked.location}</dd>
          </div>
        </dl>
        {!booked.started && (
          <a href={`/book/${token}/ics`} className="btn-secondary w-full justify-center" download="interview.ics">
            Add to calendar
          </a>
        )}
        {booked.started ? null : booked.canChange ? (
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1 justify-center" disabled={pending || slots.length === 0} onClick={() => setChanging(true)}>
              Change time
            </button>
            <button
              type="button"
              className="btn-danger flex-1 justify-center"
              disabled={pending}
              onClick={() => {
                if (confirm("Cancel this interview? You can book a new time afterwards if there are any left.")) run(() => cancelByTokenAction(token));
              }}
            >
              Cancel interview
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-2">It&apos;s less than 12 hours away, so it can&apos;t be changed here. If you can&apos;t make it, please reply to the employer&apos;s email.</p>
        )}
        <FormError message={error} />
      </section>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="panel p-4">
        <h2 className="font-semibold">No times are free right now</h2>
        <p className="mt-1 text-ink-2">The employer will add more or call you. You can come back to this link later.</p>
        {changing && (
          <button type="button" className="btn-secondary mt-3" onClick={() => setChanging(false)}>
            Back
          </button>
        )}
      </div>
    );
  }

  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = istDayKey(new Date(s.startsAt));
    days.set(k, [...(days.get(k) ?? []), s]);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => bookByTokenAction(token, picked));
      }}
      className="space-y-5"
    >
      <p className="text-ink-2">{changing ? "Pick a new time." : "Pick a time that suits you."} All times are India time.</p>
      {[...days.entries()].map(([key, list]) => (
        <fieldset key={key}>
          <legend className="mb-2 font-semibold">{istDay(new Date(list[0].startsAt))}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((s) => (
              <label
                key={s.id}
                className={cx(
                  "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2 text-center",
                  picked === s.id ? "border-primary bg-primary-soft font-semibold text-primary" : "border-line bg-surface",
                )}
              >
                <input type="radio" name="slot" value={s.id} className="sr-only" checked={picked === s.id} onChange={() => setPicked(s.id)} />
                <span className="tnum">{istTime(new Date(s.startsAt))}</span>
                <span className="text-xs text-ink-3">{INTERVIEW_MODE_LABELS[s.mode]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <FormError message={error} />
      <div className="flex gap-3">
        {changing && (
          <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setChanging(false)}>
            Keep my time
          </button>
        )}
        <button type="submit" className="btn-primary flex-1 justify-center" disabled={!picked || pending}>
          {pending ? "Booking…" : "Confirm this time"}
        </button>
      </div>
    </form>
  );
}
