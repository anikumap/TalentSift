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
