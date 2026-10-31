# Data Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `Organization.retentionDays` by erasing stale candidate data, with an admin page to change the period and run it.

**Architecture:** A pure cutoff helper in `src/domain/retention.ts`, a service in `src/services/retention.ts` (the only DB code), a CLI script for cron, and an admin page `/settings/privacy` with two server actions.

**Tech Stack:** Next.js 15 server components and actions, Prisma (SQLite), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-data-retention-design.md`

## Global Constraints

- Retention days are whole numbers in 30–1095.
- Expired means every application's `updatedAt` is before `now − days`, or there are no applications and `createdAt` is before it.
- Only `Message` rows with `kind` starting `CANDIDATE_` and `createdAt` before the cutoff are erased.
- One transaction per organisation, and one `RETENTION_PURGE` audit event only when something was erased.
- Services enforce `org.admin` for `setRetentionDays`, `previewExpired` and the *Run now* action.
- No commits (user instruction).

## Review Focus

1. **Exact boundary:** a candidate whose newest application is exactly `days` old is kept. Test in Task 1.
2. **Mixed activity:** a candidate with one stale application and one recent one is kept whole, in every job. Test in Task 2.
3. **Repeated runs:** the second run erases nothing and writes no audit event. Test in Task 2.
4. **Isolation between organisations:** one org's purge never touches another org's rows, even when the other org's data is old. Test in Task 2.
5. **Audit trail kept:** erased candidates' `STAGE_CHANGED` and other audit rows still exist after the purge. Test in Task 2.

---

### Task 1: Cutoff helper and audit actions

**Files:** Create `src/domain/retention.ts`. Modify `src/domain/constants.ts` (`AUDIT_ACTIONS` gains `RETENTION_CHANGED` and `RETENTION_PURGE`) and `src/app/(app)/settings/audit/page.tsx` (labels "Retention changed" and "Old candidate data erased"). Test in `tests/unit/retention.test.ts`.

**Produces:** `retentionCutoff(now: Date, days: number): Date`, `isExpired(lastActivity: Date, cutoff: Date): boolean` (strictly before), `RETENTION_MIN_DAYS = 30`, `RETENTION_MAX_DAYS = 1095`.

- [ ] Write the tests: the cutoff is `now − days × 86 400 000 ms`; `isExpired(cutoff, cutoff) === false`; `isExpired(cutoff − 1 ms, cutoff) === true`.
- [ ] Run them and watch them fail, implement, then run them and watch them pass.

### Task 2: Retention service

**Files:** Create `src/services/retention.ts`. Test in `tests/integration/retention.test.ts`.

**Consumes:** Task 1, `audit()`, `assertCan`.
**Produces:**
- `purgeExpired(now?: Date, orgId?: string, actor?: Actor): Promise<PurgeResult[]>`, where `PurgeResult = { orgId: string; candidates: number; applications: number; messages: number; cutoff: Date }`. It returns results only for organisations where something was erased.
- `previewExpired(actor: Actor, now?: Date): Promise<Omit<PurgeResult, "orgId">>`
- `setRetentionDays(actor: Actor, days: number): Promise<void>`. It throws `AppError("VALIDATION", …, { days })` when the value is out of range.

- [ ] Write the integration tests. Age rows by updating `updatedAt`/`createdAt` directly through `db`.
  - Stale candidates are erased, along with their applications and evaluations.
  - A mixed candidate is kept.
  - Old `CANDIDATE_` messages are erased; `INVITE_MEMBER` and recent messages are kept.
  - Exactly one `RETENTION_PURGE` event is written, with the counts.
  - A second run returns `[]` and writes no new event.
  - The other organisation is untouched.
  - The erased candidates' `STAGE_CHANGED` events still exist.
  - The preview's counts equal the real run's.
  - `setRetentionDays` rejects 29, 1096 and 45.5, rejects non-admins with `FORBIDDEN`, and on success writes `RETENTION_CHANGED` with before and after.
- [ ] Run them and watch them fail, implement, then run them and watch them pass. Finish with `npm test`.

### Task 3: Cron script

**Files:** Create `scripts/retention.ts`. Modify `package.json` (`"retention": "tsx scripts/retention.ts"`) and `README.md` (a Privacy section with a sample daily cron line).

- [ ] Write the script. It prints `org <id>: erased N candidates, M applications, K messages (cutoff …)` per organisation, `Nothing to erase.` when there's nothing, and exits 1 with the org id if any organisation threw. It catches each organisation's failure separately: `purgeExpired` is called per organisation id.
- [ ] Run it against a scratch database (`DATABASE_URL` pointing into the scratchpad) after seeding. Expected: `Nothing to erase.`, since seed data is fresh.

### Task 4: Privacy settings page

**Files:** Create `src/app/(app)/settings/privacy/page.tsx` and `src/app/(app)/settings/privacy/RetentionForm.tsx`. Create `src/app/actions/privacy.ts` (`saveRetention(prev, form)` and `runRetentionNow()`, both through `runAction`). Modify `src/app/(app)/layout.tsx` (nav item `{ href: "/settings/privacy", label: "Privacy" }` next to Audit log). Test in `tests/e2e/privacy.spec.ts`.

- [ ] Write the e2e test: the admin logs in, opens Privacy, sees "365 days", changes it to 180, sees the success message and the new value after a reload, and then finds a "Retention changed" entry in the audit log.
- [ ] Build the page, following the team and billing pages' components (`PageHeader`, `.field`, `.label`, buttons). It shows the period, the preview counts with the cutoff date, a form, a *Run now* button and an explanation of what is and isn't erased.
- [ ] Run `npm run build && npm run e2e`. Expected: every test passes.
