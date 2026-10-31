"use client";

import { useState, useTransition } from "react";
import {
  bookForCandidateAction,
  cancelInterviewAction,
  resendBookingLinkAction,
  setInterviewStatusAction,
} from "@/app/actions/interviews";
import { INTERVIEW_MODE_LABELS, INTERVIEW_STATUS_LABELS, type InterviewMode, type InterviewStatus } from "@/domain/constants";
import { istDateTime } from "@/domain/interviews";
import { Badge, FormError, Notice } from "@/components/ui";

export type PanelInterview = {
  interviewId: string;
  startsAt: string;
  durationMin: number;
  mode: InterviewMode;
  location: string;
  status: InterviewStatus;
  interviewerName: string;
};

const TONE: Record<InterviewStatus, "primary" | "neutral" | "ok" | "attention"> = {
  SCHEDULED: "primary",
  CANCELLED: "neutral",
  COMPLETED: "ok",
  NO_SHOW: "attention",
};

export function InterviewsPanel({
  appId,
  atInterview,
  manage,
  interviews,
  openSlots,
}: {
  appId: string;
  atInterview: boolean;
  manage: boolean;
  interviews: PanelInterview[];
  openSlots: { id: string; startsAt: string; mode: InterviewMode }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [slotId, setSlotId] = useState("");
  const now = Date.now();
  const scheduled = interviews.filter((i) => i.status === "SCHEDULED");
  const hasScheduled = scheduled.length > 0;
  const startedOpen = scheduled.some((i) => new Date(i.startsAt).getTime() <= now);

  const run = (fn: () => Promise<{ error?: string; message?: string } | null>) =>
    start(async () => {
      const r = await fn();
      setError(r?.error);
      setMessage(r?.error ? undefined : r?.message);
      if (!r?.error) setSlotId("");
    });

  return (
    <section className="panel p-4" aria-labelledby="iv-h">
      <h2 id="iv-h" className="font-semibold">Interviews</h2>
      {interviews.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{atInterview ? "Not booked yet. They can pick a time from the link we emailed." : "None yet."}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {interviews.map((i) => {
            const started = new Date(i.startsAt).getTime() <= now;
            return (
              <li key={i.interviewId} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{istDateTime(new Date(i.startsAt))}</span>
                  <Badge tone={TONE[i.status]}>{INTERVIEW_STATUS_LABELS[i.status]}</Badge>
                </div>
                <p className="text-ink-2">
                  {INTERVIEW_MODE_LABELS[i.mode]} · {i.durationMin} min · with {i.interviewerName}
                </p>
                <p className="text-ink-3">{i.location}</p>
                {i.status === "SCHEDULED" && (
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <a href={`/api/interviews/${i.interviewId}/ics`} className="font-medium text-primary underline-offset-2 hover:underline">
                      Add to calendar
                    </a>
                    {manage && started && (
                      <>
                        <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" disabled={pending} onClick={() => run(() => setInterviewStatusAction(appId, i.interviewId, "COMPLETED"))}>
                          Mark completed
                        </button>
                        <button type="button" className="font-medium text-ink-2 underline-offset-2 hover:underline" disabled={pending} onClick={() => run(() => setInterviewStatusAction(appId, i.interviewId, "NO_SHOW"))}>
                          Didn&apos;t attend
                        </button>
                      </>
                    )}
                    {manage && !started && (
                      <button
                        type="button"
                        className="font-medium text-reject underline-offset-2 hover:underline"
                        disabled={pending}
                        onClick={() => {
                          const reason = prompt("Cancel this interview? Optionally say why (the candidate isn't shown this).");
                          if (reason !== null) run(() => cancelInterviewAction(appId, i.interviewId, reason));
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {manage && atInterview && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          {startedOpen ? (
            <p className="text-sm text-ink-3">Mark the last interview completed or didn&apos;t attend before booking another.</p>
          ) : openSlots.length > 0 ? (
            <div>
              <label htmlFor="book-slot" className="label">{hasScheduled ? "Move to another time" : "Book a time for them"}</label>
              <div className="flex gap-2">
                <select id="book-slot" className="field h-9 py-1" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                  <option value="">Choose a time</option>
                  {openSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {istDateTime(new Date(s.startsAt))} · {INTERVIEW_MODE_LABELS[s.mode]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-primary h-9" disabled={!slotId || pending} onClick={() => run(() => bookForCandidateAction(appId, slotId))}>
                  Book
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-3">No open interview times. Add some on the job&apos;s Interviews tab.</p>
          )}
          {!hasScheduled && openSlots.length > 0 && (
            <button type="button" className="btn-secondary h-8" disabled={pending} onClick={() => run(() => resendBookingLinkAction(appId))}>
              Send booking link
            </button>
          )}
        </div>
      )}
      <div className="mt-2">
        <FormError message={error} />
        {message && <Notice tone="ok">{message}</Notice>}
      </div>
    </section>
  );
}
