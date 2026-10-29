"use client";

import { useState, useTransition } from "react";
import { retryEvaluationAction } from "@/app/actions/decisions";

export function RetryButton({ appId, jobId }: { appId: string; jobId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        className="btn-secondary h-8"
        disabled={pending}
        onClick={() => start(async () => setError((await retryEvaluationAction(appId, jobId))?.error))}
      >
        {pending ? "Scoring…" : "Retry evaluation"}
      </button>
      {error && <span className="text-sm text-reject">{error}</span>}
    </div>
  );
}
