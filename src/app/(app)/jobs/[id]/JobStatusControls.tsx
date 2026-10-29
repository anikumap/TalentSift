"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { closeJobAction, publishJobAction } from "@/app/actions/jobs";
import { FormError, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { JobStatus } from "@/domain/constants";

export function JobStatusControls({
  jobId,
  status,
  applyUrl,
  applyPath,
  canPublish,
  flagCount,
}: {
  jobId: string;
  status: JobStatus;
  applyUrl: string;
  applyPath: string;
  canPublish: boolean;
  flagCount: number;
}) {
  const [pubState, publish] = useActionState(publishJobAction.bind(null, jobId), null);
  const [closeState, close] = useActionState(closeJobAction.bind(null, jobId), null);
  const [copied, setCopied] = useState(false);
  const state = status === "OPEN" ? pubState?.ok ? pubState : closeState : closeState?.ok ? closeState : pubState;

  async function copy() {
    await navigator.clipboard.writeText(applyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="panel flex flex-wrap items-center justify-between gap-4 p-4" aria-label="Publishing">
      <div className="min-w-0 space-y-1">
        {status === "OPEN" ? (
          <>
            <p className="text-sm font-semibold">Apply link</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={applyPath} target="_blank" className="truncate text-sm text-primary underline underline-offset-2">
                {applyUrl}
              </Link>
              <button type="button" className="btn-secondary h-8" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </>
        ) : status === "DRAFT" ? (
          <p className="text-sm text-ink-2">
            This job is a draft. Review the scorecard, ad and questions, then publish to get the apply link.
            {flagCount > 0 && <span className="text-attention"> The ad has {flagCount} wording suggestion{flagCount > 1 ? "s" : ""}.</span>}
          </p>
        ) : (
          <p className="text-sm text-ink-2">This job is closed. Its apply link no longer accepts applications.</p>
        )}
        {state?.message && <Notice tone="ok">{state.message}</Notice>}
        <FormError message={state?.error} />
      </div>
      {canPublish && (
        <form action={status === "OPEN" ? close : publish}>
          {status === "OPEN" ? (
            <SubmitButton className="btn-secondary" pendingText="Closing…">Close job</SubmitButton>
          ) : (
            <SubmitButton pendingText="Publishing…">{status === "CLOSED" ? "Reopen job" : "Publish job"}</SubmitButton>
          )}
        </form>
      )}
    </section>
  );
}
