"use client";

import { useActionState, useState, useTransition } from "react";
import { createOfferAction, markHiredAction, withdrawOfferAction } from "@/app/actions/offers";
import { OFFER_STATUS_LABELS, type OfferStatus } from "@/domain/constants";
import { payOutsideRange } from "@/domain/offers";
import { formatINR } from "@/domain/billing";
import { istDate } from "@/domain/interviews";
import { Badge, FormError } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type PanelOffer = {
  id: string;
  monthlyPay: number;
  startDate: string;
  respondBy: string;
  status: OfferStatus;
  signedName: string | null;
  declineReason: string | null;
  expired: boolean;
};

const TONE: Record<OfferStatus, "primary" | "ok" | "neutral" | "reject"> = { SENT: "primary", ACCEPTED: "ok", DECLINED: "reject", WITHDRAWN: "neutral" };

function OfferForm({ appId, payMin, payMax, today, tomorrow, inAWeek }: { appId: string; payMin: number; payMax: number; today: string; tomorrow: string; inAWeek: string }) {
  const [state, action] = useActionState(createOfferAction.bind(null, appId), null);
  const [pay, setPay] = useState("");
  const f = state?.fields ?? {};
  const n = Number(pay.replace(/[,\s₹]/g, ""));
  const outside = pay !== "" && Number.isFinite(n) && n > 0 && payOutsideRange(n, payMin, payMax);
  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <label htmlFor="monthlyPay" className="label">Monthly pay (₹)</label>
        <input id="monthlyPay" name="monthlyPay" inputMode="numeric" className="field" value={pay} onChange={(e) => setPay(e.target.value)} required />
        {outside && (
          <p className="mt-1 text-xs text-attention">
            Outside the advertised {formatINR(payMin * 100)}–{formatINR(payMax * 100)}. You can still send it.
          </p>
        )}
        {f.monthlyPay && <p className="error-text">{f.monthlyPay}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="startDate" className="label">Start date</label>
          <input id="startDate" name="startDate" type="date" className="field" min={today} defaultValue={inAWeek} required />
          {f.startDate && <p className="error-text">{f.startDate}</p>}
        </div>
        <div>
          <label htmlFor="respondBy" className="label">Reply by</label>
          <input id="respondBy" name="respondBy" type="date" className="field" min={tomorrow} required />
          {f.respondBy && <p className="error-text">{f.respondBy}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="terms" className="label">Other terms <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea id="terms" name="terms" rows={3} maxLength={2000} className="field" placeholder="e.g. Six-day week, one paid leave a month, uniform provided." />
        {f.terms && <p className="error-text">{f.terms}</p>}
      </div>
      <FormError message={state?.error} />
      <SubmitButton pendingText="Sending…">Send offer</SubmitButton>
    </form>
  );
}

export function OfferPanel({
  appId,
  stage,
  offers,
  payMin,
  payMax,
  today,
  tomorrow,
  inAWeek,
}: {
  appId: string;
  stage: string;
  offers: PanelOffer[];
  payMin: number;
  payMax: number;
  today: string;
  tomorrow: string;
  inAWeek: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const current = offers.find((o) => o.status === "ACCEPTED" || (o.status === "SENT" && !o.expired));
  const past = offers.filter((o) => o !== current);
  const canOffer = !current && (stage === "INTERVIEW" || stage === "OFFER");

  const run = (fn: () => Promise<{ error?: string } | null>) =>
    start(async () => {
      setError((await fn())?.error);
    });

  return (
    <section className="panel p-4" aria-labelledby="offer-h">
      <h2 id="offer-h" className="font-semibold">Offer</h2>
      {current && (
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{formatINR(current.monthlyPay * 100)} a month</span>
            <Badge tone={TONE[current.status]}>{OFFER_STATUS_LABELS[current.status]}</Badge>
          </div>
          <p className="text-ink-2">
            Starts {istDate(new Date(current.startDate))}
            {current.status === "SENT" && <> · reply by {istDate(new Date(current.respondBy))}</>}
          </p>
          {current.status === "ACCEPTED" && (
            <>
              <p className="text-ink-2">Signed “{current.signedName}”.</p>
              {stage === "OFFER" && (
                <button type="button" className="btn-primary w-full justify-center" disabled={pending} onClick={() => run(() => markHiredAction(appId))}>
                  Mark hired
                </button>
              )}
            </>
          )}
          {current.status === "SENT" && (
            <button
              type="button"
              className="font-medium text-reject underline-offset-2 hover:underline"
              disabled={pending}
              onClick={() => {
                const reason = prompt("Withdraw this offer? Say why (kept in the audit log, not sent to the candidate).");
                if (reason !== null) run(() => withdrawOfferAction(appId, current.id, reason));
              }}
            >
              Withdraw offer
            </button>
          )}
        </div>
      )}
      {canOffer && <OfferForm appId={appId} payMin={payMin} payMax={payMax} today={today} tomorrow={tomorrow} inAWeek={inAWeek} />}
      {!current && !canOffer && past.length === 0 && <p className="mt-2 text-sm text-ink-3">Offers can be made after an interview.</p>}
      {past.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-sm text-ink-3">
          {past.map((o) => (
            <li key={o.id}>
              {formatINR(o.monthlyPay * 100)} · {o.expired ? "Expired without a reply" : OFFER_STATUS_LABELS[o.status]}
              {o.declineReason && <> · “{o.declineReason}”</>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        <FormError message={error} />
      </div>
    </section>
  );
}

