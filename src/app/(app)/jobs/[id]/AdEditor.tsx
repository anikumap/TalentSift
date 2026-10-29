"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { regenerateAdAction, saveDetailsAction } from "@/app/actions/jobs";
import { applySuggestion, checkWording } from "@/domain/wording";
import { FormError, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function AdEditor({
  jobId,
  adText,
  skillNames,
  editable,
}: {
  jobId: string;
  adText: string;
  skillNames: string[];
  editable: boolean;
}) {
  const [text, setText] = useState(adText);
  const [state, setState] = useState<ActionState>(null);
  const [busy, start] = useTransition();
  useEffect(() => setText(adText), [adText]);
  const flags = useMemo(() => checkWording(text, { skillNames, hourly: true }), [text, skillNames]);
  const dirty = text !== adText;

  function save() {
    start(async () => setState(await saveDetailsAction(jobId, { adText: text })));
  }

  function regenerate() {
    if (dirty && !confirm("Replace your edits with a new ad written from the scorecard?")) return;
    start(async () => {
      const result = await regenerateAdAction(jobId);
      setState(result);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div>
        <label htmlFor="ad" className="text-lg font-semibold">Job ad</label>
        <p className="mb-3 text-sm text-ink-3">Shown at the top of the apply page.</p>
        <textarea
          id="ad"
          className="field min-h-[420px] resize-y leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!editable}
        />
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save ad"}
            </button>
            <button type="button" className="btn-secondary" onClick={regenerate} disabled={busy}>
              Rewrite from scorecard
            </button>
            {state?.ok && !dirty && <Notice tone="ok">{state.message}</Notice>}
            <FormError message={state?.error} />
          </div>
        )}
      </div>

      <aside aria-labelledby="wording-h">
        <h2 id="wording-h" className="font-semibold">Inclusive wording check</h2>
        {flags.length === 0 ? (
          <p className="mt-2 text-sm text-ok">No exclusionary wording found.</p>
        ) : (
          <ul className="mt-3 space-y-3" aria-live="polite">
            {flags.map((f) => (
              <li key={`${f.index}-${f.phrase}`} className="rounded-md border border-line bg-surface p-3 text-sm">
                <p>
                  <span className="rounded bg-attention-soft px-1 font-semibold text-attention">{f.phrase}</span>
                  <span className="text-ink-3"> → </span>
                  <span className="font-semibold">{f.suggestion}</span>
                </p>
                <p className="mt-1 text-ink-2">{f.reason}</p>
                {editable && (
                  <button type="button" className="btn-secondary mt-2 h-8" onClick={() => setText(applySuggestion(text, f))}>
                    Use “{f.suggestion}”
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
