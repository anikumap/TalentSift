# Hiring analytics and bias monitor — design

Date: 2026-10-30
Status: self-approved by the implementer under the user's standing instruction ("implement it all, don't ask for permission, do as many phases as possible"). Review before merge.

## Goal

Give the hiring team two zero-cost pages:

1. **Analytics.** Where candidates drop off, how fast the team decides, what scores look like and why people are rejected.
2. **Fairness monitor.** Whether any group of applicants, by their own optional self-description, is advanced at a markedly lower rate than others (the four-fifths rule), without that information ever reaching reviewers or the grader.

## Data

- **Funnel and timing** come from `AuditEvent` rows (`APPLICATION_SUBMITTED`, `STAGE_CHANGED` with `before.stage`/`after.stage`), so the numbers survive the retention purge. That's the reason audit events are kept.
- **Scores** come from live `Application.totalScore`. Erased candidates simply drop out.
- **Self-ID (new):** an optional "About you (optional)" block on the last apply step, with three questions:
  - Gender: Woman / Man / Non-binary / Prefer not to say
  - Age: 18–24 / 25–34 / 35–44 / 45–54 / 55+ / Prefer not to say
  - Disability: Yes / No / Prefer not to say

  The block carries clear copy: *optional, never shown to anyone reviewing your application, only used in totals to check our hiring is fair.*

  It's stored in a new table `SelfId { id, applicationId @unique → Application (onDelete Cascade), genderEnc, ageEnc, disabilityEnc, createdAt }`, each value encrypted with the existing `encrypt()`. Missing or "Prefer not to say" isn't stored at all. The retention purge cascades to it.

## Rules

- Self-ID is never read by `getApplicationDetail`, `listShortlist`, the grader or any email. Only `src/services/fairness.ts` reads it.
- **Selection rate** for a group at stage S = applicants in the group who reached S or later in the pipeline (`SHORTLISTED`, `INTERVIEW`, `OFFER`, `HIRED`), out of all group applicants whose application is past `APPLIED` or older than 7 days. A candidate's furthest stage comes from their current stage plus any `STAGE_CHANGED` history; rejected candidates count as having reached the furthest stage recorded before rejection.
- **Impact ratio** = group rate ÷ the highest group rate for that characteristic and stage. A ratio below **0.8** is flagged.
- **Small groups:** a group with fewer than **5** applicants is shown as "Too few to compare" and its rate isn't shown. This prevents re-identification and noise. If fewer than 2 groups have 5 or more, the whole characteristic reads "Not enough self-ID responses yet".
- **Mean score by group** is shown alongside, so the team can tell whether a gap starts at grading or at human decisions.
- The fairness monitor is reports only. It never changes scores or stages.

## Analytics page `/analytics`

Admin, Recruiter and Hiring manager can see it (the `stage.change` roles). There are filters for job (all or one) and period (30 days / 90 days / 12 months / all time, by application date).

- **Funnel:** applicants → shortlisted → interview → offer → hired, with counts and the step-to-step conversion %.
- **Speed:** median days from application to first decision (first `STAGE_CHANGED`), and median days to hire.
- **Waiting:** applications still in Applied after 2 days.
- **Score distribution:** five buckets 0–19, 20–39, 40–59, 60–79, 80–100, counted for live applications.
- **Rejection reasons:** count per reason code.

## Fairness page `/analytics/fairness`

Admin and Recruiter only, under a new RBAC action `fairness.view`. There's one table per characteristic: group, applicants, shortlisted rate, interview rate, impact ratios with a flag, and mean score. It also shows the share of applicants who answered any self-ID question, and explains the method in plain language.

## Interfaces

- `src/domain/fairness.ts` (pure):
  - `selectionRates(rows: { group: string; reached: Stage }[], stage: Stage, minGroup = 5): GroupRate[]`
  - `impactRatios(rates: GroupRate[]): GroupRate[]`
  - `FOUR_FIFTHS = 0.8`, `MIN_GROUP = 5`
  - `GroupRate = { group: string; n: number; selected: number; rate: number | null; ratio: number | null; flagged: boolean }`
- `src/domain/analytics.ts` (pure): `funnel(stagesReached: Stage[]): FunnelStep[]`, `median(xs: number[]): number | null`, `scoreBuckets(scores: number[]): number[]`.
- `src/services/analytics.ts`: `getAnalytics(actor, { jobId?, period })`.
- `src/services/fairness.ts`: `getFairnessReport(actor, { jobId? })`.
- `src/services/applications.ts`: `submitApplication` accepts optional `selfId: { gender?, age?, disability? }`, validated against the fixed option lists, and writes a `SelfId` row in the same transaction.
- Nav: "Analytics" for the `stage.change` roles. The fairness page is linked from the analytics page for `fairness.view` roles.

## Errors and edge cases

- Self-ID values outside the option lists are rejected with a 400. Partial answers are fine.
- No applications, or a job with no applications, shows empty states, not division by zero.
- An org with no audit history (fresh) shows zeros.
- The period filter applies to application date. Median durations ignore applications without a decision.

## Testing

- Unit:
  - `selectionRates` and `impactRatios`: the four-fifths flag at 0.79 versus 0.8, suppression under 5, fewer than 2 comparable groups.
  - `funnel` conversions, `median` with odd/even/empty input, bucket edges (19/20, 79/80, 100).
- Integration:
  - Self-ID is stored encrypted and not returned by `getApplicationDetail` or `listShortlist`.
  - The fairness report computes rates from real stage changes.
  - Furthest-stage counting for rejected candidates.
  - RBAC: an interviewer can't see analytics; a hiring manager can see analytics but not fairness.
  - Retention erases self-ID.
- e2e: a candidate fills in the optional self-ID; the admin opens Analytics and sees the funnel, then opens Fairness and sees "Too few to compare".

## Out of scope

Statistical significance tests, intersectional groups, exports, and caste or religion questions. The last is deliberate: asking is legally sensitive in India, and the monitor works with the three characteristics above.
