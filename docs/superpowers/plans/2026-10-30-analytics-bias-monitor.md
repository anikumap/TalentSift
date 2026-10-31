# Analytics and Fairness Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An analytics page (funnel, speed, scores, rejection reasons) and a fairness monitor built on optional, encrypted, reviewer-invisible self-ID.

**Architecture:** Pure maths in `src/domain/analytics.ts` and `src/domain/fairness.ts`. DB reads in `src/services/analytics.ts` and `src/services/fairness.ts`. A new `SelfId` table written by `submitApplication`. Two server-rendered pages under `/analytics`.

**Tech Stack:** Next.js 15, Prisma (SQLite), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-analytics-bias-monitor-design.md`

## Global Constraints

- `FOUR_FIFTHS = 0.8` (flagged when ratio < 0.8), `MIN_GROUP = 5`.
- Self-ID options are fixed:
  - gender: `woman | man | non_binary`
  - age: `18_24 | 25_34 | 35_44 | 45_54 | 55_plus`
  - disability: `yes | no`

  "Prefer not to say" is simply not stored.
- Self-ID is read only by `src/services/fairness.ts`.
- RBAC: analytics needs `stage.change`; fairness needs the new action `fairness.view` (ADMIN, RECRUITER).
- No commits.

## Review Focus

1. **Leakage:** self-ID must not appear in `getApplicationDetail`, `listShortlist`, grading input or emails. Integration test in Task 3.
2. **Small groups:** groups under 5 show no rate or ratio, so they can't be re-identified. Unit test in Task 1.
3. **Rejected candidates' furthest stage:** a candidate rejected at Interview counts as having reached Interview, not Applied. Integration test in Task 4.
4. **Empty data:** no applications at all renders without NaN or division errors. Unit test in Task 1, integration test in Task 4.
5. **Retention:** the purge removes `SelfId` rows (cascade). Integration test in Task 3.

---

### Task 1: Pure maths

**Files:** Create `src/domain/analytics.ts` and `src/domain/fairness.ts`. Tests in `tests/unit/analytics.test.ts` and `tests/unit/fairness.test.ts`.

**Produces:**
- `funnel(reached: Stage[]): { stage: Stage; count: number; conversion: number | null }[]` over `PIPELINE`. `count` = items whose furthest stage is ≥ that stage; `conversion` = count ÷ previous count, or `null` when the previous count is 0.
- `median(xs: number[]): number | null`
- `scoreBuckets(scores: number[]): [number, number, number, number, number]`
- `pipelineIndex(stage: Stage): number`: `PIPELINE` index; −1 for REJECTED and ON_HOLD.
- `selectionRates(rows: { group: string; reached: Stage }[], stage: Stage, minGroup = MIN_GROUP): GroupRate[]`, sorted by group name.
- `impactRatios(rates: GroupRate[]): GroupRate[]`. Compares against the highest rate among groups with n ≥ minGroup; `ratio`/`flagged` are null/false for small groups.
- `comparable(rates: GroupRate[]): boolean`: true if 2 or more groups have n ≥ minGroup.

- [ ] Tests:
  - With rates 10/10 and 7.9/10, the second group is flagged (ratio 0.79) and the first isn't.
  - With 10/10 and 8/10, nothing is flagged (0.8 isn't below 0.8).
  - n = 4 gives `rate: null` and `ratio: null`.
  - One big group plus one small group gives `comparable === false`.
  - Empty input gives `[]`.
  - `funnel([])` gives all zeros with `conversion: null`.
  - `funnel(["HIRED", "APPLIED"])` gives APPLIED 2, SHORTLISTED 1 (conversion 0.5).
  - `median([])` is `null`, `median([3, 1, 2])` is 2, `median([1, 2, 3, 4])` is 2.5.
  - `scoreBuckets([0, 19, 20, 79, 80, 100])` is `[2, 1, 0, 1, 2]`.
- [ ] Watch them fail, implement, then watch them pass.

### Task 2: RBAC and nav

**Files:** Modify `src/lib/rbac.ts` (`"fairness.view": ["ADMIN", "RECRUITER"]`) and `src/app/(app)/layout.tsx` (an "Analytics" nav item for `stage.change`). Test in `tests/unit/rbac.test.ts`.

- [ ] Test that `can("RECRUITER", "fairness.view")` is true and `can("HIRING_MANAGER", "fairness.view")` is false.

### Task 3: Self-ID capture

**Files:**
- Modify `prisma/schema.prisma` (the `SelfId` model plus the `Application.selfId SelfId?` relation).
- Modify `src/services/applications.ts`: `applicationSchema` gains an optional `selfId` object; a `SelfId` row is created only if at least one value is set.
- Modify `src/app/api/apply/[slug]/route.ts`: read the `selfId` JSON field.
- Modify `src/app/apply/[slug]/ApplyFlow.tsx`: an "About you (optional)" fieldset on the last step, with three `<select>`s defaulting to "Prefer not to say", plus the copy from the spec.
- Create `src/domain/selfid.ts`: option lists and labels.
- Test in `tests/integration/selfid.test.ts`.

- [ ] Tests:
  - Submitting with `selfId: { gender: "woman", age: "25_34" }` stores one row whose fields aren't plain text, and `decrypt(genderEnc) === "woman"`.
  - `disabilityEnc` is null.
  - Submitting with an invalid value (`gender: "x"`) fails with `VALIDATION`.
  - Submitting with no selfId stores no row.
  - The JSON of `getApplicationDetail` and `listShortlist` contains neither `"woman"` nor `genderEnc`.
  - After the application ages past retention, `purgeExpired` leaves 0 `SelfId` rows.
- [ ] Run `npx prisma db push` for the dev/test schema (the test global setup pushes too), then implement.

### Task 4: Services

**Files:** Create `src/services/analytics.ts` and `src/services/fairness.ts`. Tests in `tests/integration/analytics.test.ts`.

**Produces:**
- `getAnalytics(actor, { jobId?: string; period: "30" | "90" | "365" | "all" })` returns `{ funnel, medianDaysToDecision, medianDaysToHire, waiting, scoreBuckets, rejectionReasons: { reason: string; count: number }[], total }`.
- `getFairnessReport(actor, { jobId?: string })` returns `{ responded: number; total: number; characteristics: { key: "gender" | "age" | "disability"; label: string; comparable: boolean; stages: { stage: "SHORTLISTED" | "INTERVIEW"; rates: GroupRate[] }[]; meanScore: Record<string, number | null> }[] }`.
- Furthest stage = the maximum `pipelineIndex` across the current stage and every `STAGE_CHANGED` `before`/`after` stage for that application.
- Eligibility: past `APPLIED`, or created more than 7 days ago.

- [ ] Tests:
  - Three candidates; advance one to Interview and then reject them. The funnel shows Applied 3, Shortlisted 1, Interview 1, and rejection reasons show that reason once.
  - The fairness report with 6 women (5 shortlisted) and 6 men (2 shortlisted) flags men at Shortlisted (ratio 0.4).
  - An interviewer gets `FORBIDDEN` from analytics; a hiring manager gets `FORBIDDEN` from fairness.
  - An empty org gives an all-zero funnel and `null` medians.

### Task 5: Pages

**Files:** Create `src/app/(app)/analytics/page.tsx` and `src/app/(app)/analytics/fairness/page.tsx`. Test in `tests/e2e/analytics.spec.ts`.

- [ ] e2e:
  - A candidate applies and picks "Woman" in the optional self-ID.
  - The admin opens Analytics and sees "Applied" with 1.
  - The admin opens "Fairness monitor" and sees "Not enough self-ID responses yet".
- [ ] Build both pages with the existing components: tables in `.panel`, ratio flags as `Badge tone="attention"`, a plain-language method note, and filters as a GET form (like the audit page).
- [ ] Run `npm run build && npm run e2e && npm test`, all passing.
