"use client";

import { useRef, useState, useTransition } from "react";
import { changeStageAction } from "@/app/actions/decisions";
import { REJECT_REASONS, STAGE_LABELS, type RejectReason, type Stage } from "@/domain/constants";
import { nextStage, isFinal } from "@/domain/stages";
import { FormError } from "@/components/ui";

/** Advance / Hold / Reject. Reject always asks for a reason first. */
export function DecisionButtons({
  appId,
  jobId,
  stage,
  compact = false,
  offerPanel = false,
}: {
  appId: string;
  jobId: string;
  stage: Stage;
  compact?: boolean;
  /** The page has an Offer panel, which owns the move to Offer (send an offer) and to Hired (after acceptance). */
  offerPanel?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  if (isFinal(stage)) return null;

  const next = stage === "ON_HOLD" ? "SHORTLISTED" : nextStage(stage);
  const advanceTo = offerPanel && (next === "OFFER" || next === "HIRED") ? null : next;
  const run = (to: Stage, reason?: { code: RejectReason; note?: string }) =>
    start(async () => {
      const r = await changeStageAction(appId, jobId, to, reason);
      setError(r?.error);
      if (!r?.error) dialog.current?.close();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {advanceTo && (
        <button type="button" className="btn-primary h-8" disabled={pending} onClick={() => run(advanceTo)}>
          {advanceTo === "SHORTLISTED" ? "Shortlist" : `Move to ${STAGE_LABELS[advanceTo].toLowerCase()}`}
        </button>
      )}
      {stage !== "ON_HOLD" && (
        <button type="button" className="btn-secondary h-8" disabled={pending} onClick={() => run("ON_HOLD")}>
          Hold
        </button>
      )}
      <button type="button" className="btn-danger h-8" disabled={pending} onClick={() => dialog.current?.showModal()}>
        Reject
      </button>
      {!compact && error && <FormError message={error} />}
      <RejectDialog ref={dialog} pending={pending} error={error} onConfirm={(reason) => run("REJECTED", reason)} />
    </div>
  );
}

export function RejectDialog({
  ref,
  pending,
  error,
  onConfirm,
}: {
  ref: React.Ref<HTMLDialogElement>;
  pending: boolean;
  error?: string;
  onConfirm: (reason: { code: RejectReason; note?: string }) => void;
}) {
  const [code, setCode] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  return (
    <dialog
      ref={ref}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      aria-labelledby="reject-title"
    >
      <form
        method="dialog"
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code) onConfirm({ code, note: note.trim() || undefined });
        }}
      >
        <h2 id="reject-title" className="text-lg font-bold">Reject this candidate?</h2>
        <p className="text-sm text-ink-2">They&apos;ll get a respectful email that doesn&apos;t mention scores. Your reason is saved to the audit log.</p>
        <fieldset>
          <legend className="label">Reason</legend>
          <div className="space-y-1.5">
            {REJECT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" className="accent-[var(--primary)]" checked={code === r} onChange={() => setCode(r)} />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="reject-note" className="label">Note (optional)</label>
          <textarea id="reject-note" rows={2} maxLength={500} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
            Cancel
          </button>
          <button type="submit" className="btn bg-reject text-white hover:opacity-90" disabled={!code || pending}>
            {pending ? "Rejecting…" : "Reject candidate"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
