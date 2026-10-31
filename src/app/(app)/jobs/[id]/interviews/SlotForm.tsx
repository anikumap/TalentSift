"use client";

import { useActionState, useState, useTransition } from "react";
import { addSlotsAction, deleteSlotAction } from "@/app/actions/interviews";
import { INTERVIEW_MODE_LABELS, INTERVIEW_MODES, ROLE_LABELS, type Role } from "@/domain/constants";
import { FormError, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

const LOCATION_HINT: Record<string, string> = {
  IN_PERSON: "Address, with a landmark",
  PHONE: "e.g. We'll call you on your mobile",
  VIDEO: "Video meeting link",
};

export function SlotForm({
  jobId,
  team,
  defaultDate,
  defaultLocation,
}: {
  jobId: string;
  team: { id: string; name: string; role: string }[];
  defaultDate: string;
  defaultLocation: string;
}) {
  const [state, action] = useActionState(addSlotsAction.bind(null, jobId), null);
  const [mode, setMode] = useState<string>("IN_PERSON");
  const f = state?.fields ?? {};
  const err = (k: string) => (f[k] ? <p className="error-text">{f[k]}</p> : null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <label htmlFor="date" className="label">Date</label>
        <input id="date" name="date" type="date" className="field" defaultValue={defaultDate} required />
        {err("date")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="from" className="label">From</label>
          <input id="from" name="from" type="time" className="field" defaultValue="10:00" required />
          {err("from")}
        </div>
        <div>
          <label htmlFor="to" className="label">Until</label>
          <input id="to" name="to" type="time" className="field" defaultValue="13:00" required />
          {err("to")}
        </div>
      </div>
      <div>
        <label htmlFor="lengthMin" className="label">Each interview</label>
        <select id="lengthMin" name="lengthMin" className="field" defaultValue="30">
          {[15, 20, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>{m} minutes</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="interviewerId" className="label">Interviewer</label>
        <select id="interviewerId" name="interviewerId" className="field" required defaultValue="">
          <option value="" disabled>Choose a teammate</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role as Role] ?? m.role})</option>
          ))}
        </select>
        {err("interviewerId")}
      </div>
      <fieldset>
        <legend className="label">How</legend>
        <div className="flex flex-wrap gap-3">
          {INTERVIEW_MODES.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} /> {INTERVIEW_MODE_LABELS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="location" className="label">Where</label>
        <input
          id="location"
          name="location"
          className="field"
          key={mode}
          defaultValue={mode === "IN_PERSON" ? defaultLocation : ""}
          placeholder={LOCATION_HINT[mode]}
          maxLength={200}
          required
        />
        <p className="mt-1 text-xs text-ink-3">Candidates see this only after they book.</p>
        {err("location")}
      </div>
      <FormError message={state?.error} />
      {state?.ok && <Notice tone="ok">{state.message}</Notice>}
      <SubmitButton pendingText="Adding…">Add times</SubmitButton>
    </form>
  );
}

export function DeleteSlotButton({ jobId, slotId }: { jobId: string; slotId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-reject">{error}</span>}
      <button
        type="button"
        className="text-sm font-medium text-ink-3 underline-offset-2 hover:text-reject hover:underline"
        disabled={pending}
        onClick={() => start(async () => setError((await deleteSlotAction(jobId, slotId))?.error))}
      >
        Remove
      </button>
    </span>
  );
}
