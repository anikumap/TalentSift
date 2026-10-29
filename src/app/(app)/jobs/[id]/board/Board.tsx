"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { changeStageAction } from "@/app/actions/decisions";
import { STAGES, STAGE_LABELS, type RejectReason, type Stage } from "@/domain/constants";
import { canTransition } from "@/domain/stages";
import { Badge, FormError, cx } from "@/components/ui";
import { RejectDialog } from "@/components/candidates/DecisionButtons";

type Card = { appId: string; name: string; stage: Stage; score: number | null; mustHavesMet: boolean };

export function Board({ jobId, cards, canMove }: { jobId: string; cards: Card[]; canMove: boolean }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [error, setError] = useState<string>();
  const [pendingReject, setPendingReject] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  function move(appId: string, to: Stage, reason?: { code: RejectReason; note?: string }) {
    const card = cards.find((c) => c.appId === appId);
    if (!card || card.stage === to) return;
    if (!canTransition(card.stage, to)) {
      setError(`Can't move from ${STAGE_LABELS[card.stage]} to ${STAGE_LABELS[to]}.`);
      return;
    }
    if (to === "REJECTED" && !reason) {
      setPendingReject(appId);
      dialog.current?.showModal();
      return;
    }
    start(async () => {
      const r = await changeStageAction(appId, jobId, to, reason);
      setError(r?.error);
      if (!r?.error) {
        dialog.current?.close();
        setPendingReject(null);
      }
    });
  }

  return (
    <>
      <div aria-live="polite" className="mb-3">
        <FormError message={error} />
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {STAGES.map((stage) => {
          const items = cards.filter((c) => c.stage === stage);
          return (
            <section
              key={stage}
              aria-labelledby={`col-${stage}`}
              onDragOver={(e) => {
                if (!canMove || !dragging) return;
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) move(dragging, stage);
                setDragging(null);
              }}
              className={cx(
                "flex w-60 shrink-0 flex-col rounded-lg border bg-surface-2/60 p-2",
                over === stage ? "border-primary bg-primary-soft" : "border-transparent",
              )}
            >
              <h2 id={`col-${stage}`} className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                {STAGE_LABELS[stage]}
                <span className="tnum font-normal text-ink-3">{items.length}</span>
              </h2>
              <ul className="min-h-16 space-y-2">
                {items.map((c) => (
                  <li
                    key={c.appId}
                    draggable={canMove && !pending}
                    onDragStart={(e) => {
                      setDragging(c.appId);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cx("panel p-3", canMove && "cursor-grab active:cursor-grabbing", dragging === c.appId && "opacity-50")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/candidates/${c.appId}`} className="min-w-0 truncate text-sm font-semibold hover:text-primary">
                        {c.name}
                      </Link>
                      <span className="tnum text-sm font-bold">{c.score ?? "—"}</span>
                    </div>
                    {!c.mustHavesMet && (
                      <div className="mt-1">
                        <Badge tone="attention">Must-have missing</Badge>
                      </div>
                    )}
                    {canMove && (
                      <label className="mt-2 block">
                        <span className="sr-only">Move {c.name} to</span>
                        <select
                          className="field h-8 py-0 text-xs"
                          value=""
                          disabled={pending || stage === "HIRED" || stage === "REJECTED"}
                          onChange={(e) => e.target.value && move(c.appId, e.target.value as Stage)}
                        >
                          <option value="">Move to…</option>
                          {STAGES.filter((s) => s !== stage).map((s) => (
                            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <RejectDialog
        ref={dialog}
        pending={pending}
        error={error}
        onConfirm={(reason) => pendingReject && move(pendingReject, "REJECTED", reason)}
      />
    </>
  );
}
