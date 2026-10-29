/** Wordmark: a sieve of four dots — the rubric's four points — beside the name. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--primary)" />
        <circle cx="7.5" cy="8" r="1.8" fill="var(--on-primary)" />
        <circle cx="14.5" cy="8" r="1.8" fill="var(--on-primary)" />
        <circle cx="7.5" cy="14" r="1.8" fill="var(--on-primary)" />
        <circle cx="14.5" cy="14" r="1.8" fill="var(--marigold)" />
      </svg>
      {!compact && <span className="text-lg font-bold tracking-tight">TalentSift</span>}
    </span>
  );
}
