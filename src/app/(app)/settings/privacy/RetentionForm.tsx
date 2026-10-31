"use client";

import { useActionState } from "react";
import { runRetentionAction, saveRetentionAction } from "@/app/actions/privacy";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@/domain/retention";
import { FormError, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function RetentionForm({ days }: { days: number }) {
  const [state, action] = useActionState(saveRetentionAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="days" className="label">Keep candidate data for (days)</label>
        <input id="days" name="days" type="number" inputMode="numeric" className="field max-w-40" defaultValue={days} min={RETENTION_MIN_DAYS} max={RETENTION_MAX_DAYS} step={1} required />
        {state?.fields?.days ? (
          <p className="error-text">{state.fields.days}</p>
        ) : (
          <p className="mt-1 text-sm text-ink-3">Between {RETENTION_MIN_DAYS} days and 3 years. Counted from each candidate's last activity.</p>
        )}
      </div>
      <FormError message={state?.fields?.days ? undefined : state?.error} />
      {state?.ok && <Notice tone="ok">{state.message}</Notice>}
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

export function RunNowForm() {
  const [state, action] = useActionState(runRetentionAction, null);
  if (state?.ok) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>I understand this permanently erases these candidates and can't be undone.</span>
      </label>
      <FormError message={state?.error} />
      <SubmitButton pendingText="Erasing…" className="btn-danger">Erase now</SubmitButton>
    </form>
  );
}
