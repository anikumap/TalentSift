# Data retention job — design

Date: 2026-10-30
Status: self-approved by the implementer under the user's standing instruction ("implement it all, don't ask for permission, do as many phases as possible"). Review before merge.

## Goal

Enforce `Organization.retentionDays` (stored since Phase 1, default 365, never enforced) by permanently erasing candidate personal data once it has gone unused for that long, and let an admin change the period. Zero cost: plain code plus a script to run from cron.

## What counts as expired

A candidate is **expired** when every one of their applications has `updatedAt` older than `now − org.retentionDays` (no activity on any application for the whole period). Stage doesn't matter: an application stuck in "Interview" for a year is stale too. A candidate with no applications is expired when `createdAt` is older than the cutoff.

## What gets erased

For each expired candidate, in one transaction per organisation:

- the `Candidate` row (encrypted name, email, phone, address, email hash), which cascades to its `Application` rows (answers, resume text, parsed resume) and their `Evaluation` rows (evidence quotes);
- candidate emails in the Outbox (`Message` rows with `kind` starting `CANDIDATE_`) created before the cutoff. These hold the email address in plain text and the name in the body.

Kept:

- **Audit events.** They're the compliance record, they hold IDs, stages, scores and reasons, but no names, emails or answer text (checked: `APPLICATION_SUBMITTED`, `EVALUATION_CREATED`, `STAGE_CHANGED`, `IDENTITY_REVEALED` store only IDs, stages, scores and reasons). Later analytics can still count the funnel from them.
- Jobs, scorecards, users, billing.

One `RETENTION_PURGE` audit event per organisation per run that erased something: `entityType "Organization"`, `after: { candidates, applications, messages, cutoff }`, actor "System" (or the admin who pressed *Run now*).

## Interfaces

- `src/domain/retention.ts`: `retentionCutoff(now: Date, days: number): Date`, plus `RETENTION_MIN_DAYS = 30` and `RETENTION_MAX_DAYS = 1095`.
- `src/services/retention.ts`:
  - `purgeExpired(now = new Date(), orgId?: string, actor?: Actor): Promise<PurgeResult[]>`, where `PurgeResult = { orgId, candidates, applications, messages, cutoff }`. Runs for every organisation, or just one.
  - `previewExpired(actor: Actor, now?): Promise<{ candidates: number; applications: number; messages: number; cutoff: Date }>`, a dry-run count for the settings page.
  - `setRetentionDays(actor: Actor, days: number): Promise<void>`. Admin only, validated to 30–1095, audited as `RETENTION_CHANGED` with before and after.
- `scripts/retention.ts`, run with `npm run retention`, calls `purgeExpired()` and prints one line per organisation. Meant for a daily cron job (README).
- New admin page `/settings/privacy`. It shows the current retention period, a form to change it, what the next run would erase (the preview), and a *Run now* button. Both actions are audited. A link to it goes in the existing settings navigation, next to Team / Billing / Audit.
- `AUDIT_ACTIONS` gains `RETENTION_CHANGED` and `RETENTION_PURGE`, with labels on the audit page.

## Errors and edge cases

- Days outside 30–1095, or not a whole number, give a field error and change nothing.
- Non-admins get `FORBIDDEN` from the services (the settings layout already redirects them).
- Each organisation is purged in its own transaction, so one failure doesn't block the others. The script exits non-zero if any organisation failed and names it.
- Running twice in a row erases nothing the second time, and writes no second audit event.
- A shortened period takes effect on the next run, not instantly. The settings page says so and shows the preview.

## Testing

- Unit: `retentionCutoff` boundaries, including exactly `days` old (not expired) versus one millisecond older (expired).
- Integration (Vitest + test DB):
  - Only fully stale candidates are erased.
  - A candidate with one recent application is kept whole.
  - Old candidate emails are erased, invite emails are kept.
  - The audit event is written once, and the audit events for the erased candidates are still there.
  - `setRetentionDays` validates, needs admin and is audited.
  - The preview matches the real run.
  - Other organisations are untouched.
- e2e: the admin opens *Settings → Privacy*, changes the period and sees it saved.

## Out of scope

Candidate-initiated deletion requests (DSAR), exporting data before erasure, and soft-delete or undo. Erasure is permanent by design.
