"use client";

import { useActionState, useState } from "react";
import { respondToOfferAction } from "@/app/actions/offers";
import { FormError } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function PrintButton() {
  return (
    <button type="button" className="btn-secondary w-full justify-center print:hidden" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}

export function OfferResponse({ token, candidateName }: { token: string; candidateName: string }) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [state, action] = useActionState(respondToOfferAction.bind(null, token), null);
  const f = state?.fields ?? {};

  return (
    <section className="space-y-4 print:hidden" aria-labelledby="respond-h">
      <h2 id="respond-h" className="text-lg font-semibold">Your answer</h2>
      <div role="radiogroup" aria-label="Accept or decline" className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
        {(["accept", "decline"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={mode === m ? "rounded-md bg-primary-soft py-2 font-semibold text-primary" : "rounded-md py-2 text-ink-2"}
          >
            {m === "accept" ? "Accept" : "Decline"}
          </button>
        ))}
      </div>

      {mode === "accept" ? (
        <form action={action} className="panel space-y-4 p-4">
          <input type="hidden" name="decision" value="accept" />
          <div>
            <label htmlFor="signedName" className="label">Type your full name to sign</label>
            <input id="signedName" name="signedName" className="field" autoComplete="name" placeholder={candidateName} required minLength={2} maxLength={120} />
            {f.signedName && <p className="error-text">{f.signedName}</p>}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4" required />
            <span>I accept this offer on the terms above.</span>
          </label>
          <FormError message={state?.error} />
          <SubmitButton pendingText="Sending…" className="btn-primary w-full justify-center">Accept offer</SubmitButton>
          <p className="text-xs text-ink-3">Your answer is final. If anything above looks wrong, reply to the employer&apos;s email before accepting.</p>
        </form>
      ) : (
        <form action={action} className="panel space-y-4 p-4">
          <input type="hidden" name="decision" value="decline" />
          <div>
            <label htmlFor="reason" className="label">
              Reason <span className="font-normal text-ink-3">(optional, shared with the employer)</span>
            </label>
            <textarea id="reason" name="reason" rows={3} maxLength={500} className="field" />
          </div>
          <FormError message={state?.error} />
          <SubmitButton pendingText="Sending…" className="btn-danger w-full justify-center">Decline offer</SubmitButton>
        </form>
      )}
    </section>
  );
}
