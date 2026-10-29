import Link from "next/link";
import type { ReactNode } from "react";
import { STAGE_LABELS, type Stage } from "@/domain/constants";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Tone = "neutral" | "primary" | "ok" | "attention" | "reject";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  primary: "bg-primary-soft text-primary",
  ok: "bg-ok-soft text-ok",
  attention: "bg-attention-soft text-attention",
  reject: "bg-reject-soft text-reject",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold", TONES[tone])}>
      {children}
    </span>
  );
}

const STAGE_TONE: Record<Stage, Tone> = {
  APPLIED: "neutral",
  SHORTLISTED: "primary",
  INTERVIEW: "primary",
  OFFER: "attention",
  HIRED: "ok",
  REJECTED: "reject",
  ON_HOLD: "attention",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

/** Four segments, one per rubric point. Filled segments are the score. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${label}: ${score} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cx("h-2 w-3.5 rounded-[2px]", i <= score ? "bg-primary" : "bg-line")} />
      ))}
    </span>
  );
}

export function TotalScore({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  return (
    <span className={cx("tnum font-bold text-ink", size === "lg" ? "text-4xl" : "text-lg")}>
      {value}
      <span className={cx("font-medium text-ink-3", size === "lg" ? "text-base" : "text-xs")}>/100</span>
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[50ch] text-ink-2">{body}</p>
      {action && (
        <Link href={action.href} className="btn-primary mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-reject/30 bg-reject-soft px-3 py-2 text-sm text-reject">
      {message}
    </p>
  );
}

export function Notice({ tone = "attention", children }: { tone?: "attention" | "ok" | "primary"; children: ReactNode }) {
  return <div className={cx("rounded-md px-3 py-2 text-sm", TONES[tone])}>{children}</div>;
}
