export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 1095;

const DAY_MS = 86_400_000;

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Data last touched strictly before the cutoff has outlived the retention period. */
export function isExpired(lastActivity: Date, cutoff: Date): boolean {
  return lastActivity.getTime() < cutoff.getTime();
}

/**
 * A stage-change reason with any free-text note removed. Reasons are stored as "<code> — <note>"
 * for rejections and as a bare note otherwise; only a known reason code survives erasure.
 */
export function stripNote(reason: string | null, codes: readonly string[]): string | null {
  if (!reason) return null;
  const code = reason.split(" — ")[0];
  return codes.includes(code) ? code : null;
}
