# TalentSift — Sub-project 1: Foundation + Phase 1 MVP

Date: 2026-10-29
Source: `~/Desktop/plan.md` (TalentSift Implementation Plan), Phase 0 compliance baseline + Phase 1.

## 1. Intent

**Outcome:** a hiring manager posts an hourly role and gets a ranked, evidence-backed, identity-hidden shortlist, then makes audited human decisions on it. This is the plan's demo: "post a role, get a ranked shortlist with evidence."

**Who it's for:** small-to-mid employers doing high-volume hourly hiring (home care, logistics, retail), initially in India.

**Success criteria:** `npm run build`, `npm test` and `npm run e2e` pass; the end-to-end path (sign up → intake → publish → apply → redacted shortlist with evidence → advance → identity revealed → audit entry) works locally with zero external accounts.

**Decided with the user:**
- Scope is sub-project 1 only. Phases 2–6 come later, each with its own spec → plan → build cycle.
- No Anthropic key yet: mock AI only, behind a provider interface.
- Local-first stack (Approach 1): SQLite now, Postgres-compatible schema.
- Billing in INR at affordable prices.

**Assumptions (not stated by the user):** a single-tenant user belongs to exactly one org in this sub-project; English-only UI; no file storage beyond the local disk for resumes.

## 2. Stack

- Next.js 15 (App Router, TypeScript, server actions + route handlers), Tailwind CSS.
- Prisma ORM, SQLite (`file:./dev.db`). No SQLite-only features; enums are stored as strings validated by zod so the move to Postgres is a provider/URL change.
- Auth: built in. Email + password (bcrypt), random session token stored hashed in a `Session` table, httpOnly cookie, 30-day expiry.
- Validation: zod. PDF text: `pdf-parse`.
- Tests: Vitest (unit + integration), Playwright (e2e).

## 3. Architecture

```
TalentSift/
  prisma/schema.prisma, prisma/seed.ts
  src/
    app/          routes and UI
      (auth)/login, (auth)/signup
      (app)/dashboard, jobs, jobs/new, jobs/[id], jobs/[id]/candidates,
            jobs/[id]/board, candidates/[appId], outbox, settings/{team,billing,audit}
      apply/[slug]          public apply flow
    domain/       pure logic, no imports from Next or Prisma
    services/     use cases; the only layer touching db + providers
    providers/    ai/, email/, billing/ — interfaces + mock implementations
    lib/          db, auth/session, rbac, crypto, validation
  tests/unit, tests/integration, tests/e2e
```

Rules:
- Pages and server actions call `services/` only.
- Every service function takes an `actor` (the session user) and checks permissions with `lib/rbac`.
- Every mutation that changes a score, stage or scorecard writes an `AuditEvent` in the same transaction.

## 4. Data model

| Entity | Key fields |
|---|---|
| Organization | id, name, createdAt |
| User | id, orgId, email (unique), passwordHash, name, role: ADMIN \| RECRUITER \| HIRING_MANAGER \| INTERVIEWER |
| Session | id, userId, tokenHash, expiresAt |
| Invite | id, orgId, email, role, tokenHash, expiresAt, acceptedAt |
| Job | id, orgId, title, roleFamily, location, payMin, payMax (INR/month), shifts, status: DRAFT \| OPEN \| CLOSED, slug (unique), adText, openedAt |
| Scorecard | id, jobId (1:1) |
| Skill | id, scorecardId, name, description, weight (int, all skills sum to 100), keywords (JSON) |
| MustHave | id, scorecardId, label, kind: LICENSE \| AVAILABILITY \| PAY \| OTHER, question |
| WorkSampleQuestion | id, jobId, prompt, skillIds (JSON), order |
| Candidate | id, orgId, nameEnc, emailEnc, phoneEnc, addressEnc, emailHash (lookup) |
| Application | id, jobId, candidateId, publicRef (e.g. A7F2), stage, consentAt, mustHaveAnswers (JSON), answers (JSON), resumeText, resumeParsed (JSON), totalScore, evalStatus: PENDING \| DONE \| FAILED, revealed (bool), createdAt |
| Evaluation | id, applicationId, skillId, score (0–4), evidence (JSON string[]), model, promptVersion, createdAt |
| AuditEvent | id, orgId, actorId (nullable for candidate/system), action, entityType, entityId, reason, before (JSON), after (JSON), createdAt — append-only |
| Message | id, orgId, to, subject, body, kind, createdAt (mock email outbox) |
| Subscription | id, orgId (1:1), plan: TRIAL \| STARTER \| GROWTH, status, trialEndsAt, currentPeriodEnd |
| JobCredit | id, orgId, jobId (nullable), expiresAt (per-job ₹399 purchase) |

Stages: `APPLIED → SHORTLISTED → INTERVIEW → OFFER → HIRED`, plus `REJECTED` and `ON_HOLD` reachable from any non-final stage.

## 5. Compliance baseline

- **Encryption at rest:** candidate personal data encrypted with AES-256-GCM (`lib/crypto`), key from `ENCRYPTION_KEY` (32-byte base64). Email additionally stored as an HMAC hash for duplicate lookup.
- **Hidden identity:** all shortlist, board and evaluation views use a `RedactedCandidate` DTO (publicRef only). Identity is decrypted and shown only when `application.revealed` is true, which is set when a human advances the candidate to SHORTLISTED or beyond. Resume text shown in redacted views has emails, phone numbers and the candidate's name removed by `domain/redact`.
- **Human in the loop:** the AI only writes Evaluations. Stage changes happen only through `services/decisions.changeStage(actor, appId, toStage, reason)`. REJECTED requires a reason from a fixed list (+ optional note). No code path rejects automatically. INTERVIEWER cannot change stages.
- **Audit log:** actions `SCORECARD_UPDATED`, `JOB_PUBLISHED`, `JOB_CLOSED`, `APPLICATION_SUBMITTED`, `EVALUATION_CREATED`, `STAGE_CHANGED`, `IDENTITY_REVEALED`, `MEMBER_INVITED`, `PLAN_CHANGED`. Viewer at `/settings/audit` (ADMIN only), filterable by job and action.
- **Consent:** the apply flow cannot submit without an explicit consent checkbox; `consentAt` stored.
- **Retention:** org setting `retentionDays` (default 365) stored; enforcement job deferred to a later sub-project (documented, not built).
- **Prompt-injection guard:** `domain/injection` flags phrases like "ignore previous instructions", "rank me first", "you are an AI" and hidden-text patterns. The AI provider receives candidate text inside delimited data blocks; flagged applications show a warning badge to the recruiter. Flags never change the score by themselves.

## 6. Providers

```ts
interface AIProvider {
  generateScorecard(intake: IntakeAnswers): Promise<ScorecardDraft>
  generateJobAd(job: JobInfo, scorecard: ScorecardDraft): Promise<string>
  gradeAnswers(input: { skills: Skill[]; questions: Q[]; answers: string[] }): Promise<SkillGrade[]>
  parseResume(text: string): Promise<ParsedResume>
  readonly model: string; readonly promptVersion: string
}
interface EmailProvider { send(msg: { orgId; to; subject; body; kind }): Promise<void> }
interface BillingProvider { createCheckout(orgId, plan | 'JOB_CREDIT'): Promise<{ url }>; confirm(sessionId): Promise<void> }
```

- `MockAIProvider` (model `mock-ai`, promptVersion `mock-v1`): deterministic.
  - Scorecard: role-family templates (caregiver, warehouse associate, retail associate, delivery driver) else keyword heuristics from the intake answers; always 4–6 skills.
  - Grading: per skill, splits answers into sentences, scores keyword/rubric matches to 0–4, returns up to 2 matching sentences as evidence quotes. Same input → same output.
  - Resume: regex extraction of certifications, years of experience, recent titles.
- `MockEmailProvider` writes to `Message` (visible in `/outbox`).
- `MockBillingProvider` returns an internal `/settings/billing/checkout?session=…` page with a "Pay (test)" button that calls `confirm`.
- Selection via `lib/providers.ts`; real providers (Claude, Resend, Razorpay) plug in later without service changes.

## 7. Features

**1.1 Role intake → scorecard** (`/jobs/new`; ADMIN, RECRUITER, HIRING_MANAGER). Chat-style guided form with 6 questions: role title, location, top 3 daily tasks, must-haves, pay range (INR/month), shifts. Two-column layout; the scorecard preview on the right updates after each answer. Result is editable: rename skills, edit descriptions, adjust weights (auto-normalized to sum to 100), add/remove skills (min 3, max 6) and must-haves. Saves as a DRAFT job.

**1.2 Job post generator.** Generates `adText` from job + scorecard. `domain/wording` checks the ad and returns flags `{ phrase, reason, suggestion }` for: gendered/age-coded terms ("young", "energetic young", "salesman", "he"), jargon ("rockstar", "ninja"), "native speaker", degree requirements for hourly roles, physical requirements with no matching skill. Flags shown inline; one-click replace. Editable text.

**1.3 Hosted apply page** (`/apply/[slug]`, public, OPEN jobs only). Steps: (1) about the job + consent, (2) name, email, phone, city, (3) must-have yes/no questions, (4) work-sample answers (3 questions, textarea, 1000 chars max each), (5) optional resume (PDF or .txt, ≤5MB), (6) confirmation with publicRef. Mobile-first, one column, progress bar, large tap targets, state kept between steps client-side, single server submit. Duplicate application (same email hash + job) is rejected with a friendly message.

**1.4 Work samples.** Template library per role family (3 scenario questions each, each mapped to 1–3 skills). Editable per job before publishing. On submit, grading runs in the request (mock is fast); on provider error the application is saved with `evalStatus=FAILED` and a "Retry evaluation" button appears.

**1.5 Resume parsing.** Text extracted with `pdf-parse`; `parseResume` produces `{ certifications[], yearsExperience, titles[] }`. Resume signal (0–1): certifications matching must-haves/skills and experience (capped at 5 years). Weight ≤10%.

**1.6 Ranked shortlist** (`/jobs/[id]/candidates`). Ranked by `totalScore`. Columns: publicRef, total, per-skill bars, must-haves met (✓ / ⚠ with count), injection flag, stage. Row expands to a "why" summary (top 2 strengths, weakest skill) and evidence quotes per skill. Filters: must-haves met, minimum score, stage. Candidates failing must-haves are marked, never hidden by default or rejected.

**1.7 One-click actions.** Advance (to the next stage), Hold, Reject. Reject opens a dialog with required reason (`Does not meet must-have`, `Lower skill evidence than other candidates`, `Position filled`, `Candidate withdrew`, `Other`) + optional note. Advance to SHORTLISTED sends an invite email; Reject sends a respectful templated rejection email. Both via EmailProvider.

**1.8 Pipeline board** (`/jobs/[id]/board`). Kanban columns per stage with redacted cards (identity shown if revealed). Drag and drop plus a "Move to…" menu for keyboard users. All moves go through `changeStage`; dropping into Rejected opens the reason dialog; invalid moves are refused with a message.

**1.9 Billing (INR)** (`/settings/billing`; ADMIN).

| Plan | Price | Active (OPEN) jobs |
|---|---|---|
| Trial (14 days, default on signup) | Free | 1 |
| Starter | ₹999 / month | 3 |
| Growth | ₹2,999 / month | Unlimited |
| Per-job credit | ₹399 one-off, 30 days | +1 job |

Checkout shows subtotal, GST 18% and total, formatted `en-IN` (₹2,999; GST ₹539.82; total ₹3,538.82). `domain/billing.canPublish(subscription, openJobCount, credits)` enforces limits at publish time; an expired trial with no credits cannot publish. Amounts stored in paise (integers).

**Supporting:** signup creates an org + ADMIN + trial; team invites (`/settings/team`, ADMIN) send a mock email with an accept link that sets name + password; dashboard shows open jobs, new applicants per job, and "waiting on you" (applications in APPLIED older than 2 days); `/outbox` lists mock emails. Seed script: demo org (`admin@demo.test` / `demo1234`), 2 open jobs (Caregiver, Warehouse Associate), ~12 evaluated candidates.

## 8. Scoring

```
skillPart  = Σ_skills (weight/100) × (score/4)          // 0..1
total      = round(100 × (0.9 × skillPart + 0.1 × resumeSignal))
```
If no resume: `total = round(100 × skillPart)`. Every Evaluation stores `model` and `promptVersion`.

## 9. Permissions

| Action | ADMIN | RECRUITER | HIRING_MANAGER | INTERVIEWER |
|---|---|---|---|---|
| Create/edit job & scorecard | ✓ | ✓ | ✓ | – |
| Publish/close job | ✓ | ✓ | – | – |
| View shortlist & evidence | ✓ | ✓ | ✓ | ✓ |
| Change stage | ✓ | ✓ | ✓ | – |
| Team, billing, audit log | ✓ | – | – | – |

## 10. Error handling

- zod on every server action and route input; field-level messages in forms.
- Permission failures return 403 / an inline "You don't have access" state.
- AI failure → application saved, `evalStatus=FAILED`, retry button; never lose a candidate submission.
- Not-found and closed jobs: the apply page shows "This job is no longer accepting applications."
- Resume parse failure → application still submitted without resume signal.

## 11. UI

Built with the frontend-design skill. Calm, trustworthy, practical.
- Tokens on `:root` with dark mode: warm off-white background, deep ink-teal primary, amber for attention, muted red for rejection only. Inter for UI; tabular numerals for scores.
- App shell: left sidebar (Dashboard, Jobs, Candidates, Outbox, Settings), top bar with org name and user menu.
- Screens: dashboard, intake (two-column chat + live scorecard), job detail (ad + wording flags + work samples + publish), shortlist (dense table with expandable evidence), board, candidate detail, apply flow (mobile single column), settings pages.
- Accessibility: semantic HTML, labels on all inputs, visible focus rings, keyboard alternative for drag, AA contrast in both themes.

## 12. Testing

- **Unit (Vitest):** scoring + weight normalization, wording checker, redaction, crypto round-trip, injection detection, `canPublish`, GST/INR formatting, stage transition rules, mock AI determinism.
- **Integration (Vitest + temp SQLite per run):** `changeStage` writes audit + requires reject reason + denies INTERVIEWER; `submitApplication` encrypts personal data, creates evaluations, rejects duplicates, survives AI failure; `publishJob` enforces plan limits; signup creates org/admin/trial.
- **E2E (Playwright, against `next start` with a fresh db):** sign up → intake → publish → apply on the public page → redacted shortlist with evidence → advance → identity revealed → audit entry visible; plus a mobile-viewport apply run.
- **Done =** `npm run build`, `npm test`, `npm run e2e` all pass.

## 13. Out of scope (later sub-projects)

AI screens, SMS, scheduling, status page, careers widget, multi-board posting (Phase 2); interviews/offers (Phase 3); Slack/mobile/digest/referrals (Phase 4); onboarding, analytics, bias monitor (Phase 5); integrations, API, SOC 2 (Phase 6); real Claude/Resend/Razorpay providers; retention enforcement job; multi-org membership.
