# TalentSift

Evidence-based hiring for hourly roles (home care, logistics, retail). A hiring manager describes a role in a short chat, applicants answer real job situations on their phone, and the team gets a ranked shortlist with quoted evidence. Names stay hidden until a person decides to shortlist someone.

This is the foundation and the Phase 1 MVP. Built with Next.js 15, React 19, TypeScript, Prisma (SQLite) and Tailwind CSS 4, tested with Vitest and Playwright.

## Run it

Requires Node 20+ (tested on Node 24).

```bash
npm install
cp .env.example .env          # then set ENCRYPTION_KEY (command is in the file)
npm run db:push               # creates prisma/dev.db (SQLite)
npm run seed                  # optional demo data
npm run dev                   # http://localhost:3000
```

Demo logins after seeding: `admin@demo.test` / `demo1234` (Admin) and `interviewer@demo.test` / `demo1234` (Interviewer). The seed script refuses to run when `NODE_ENV=production`.

Billing and email are mocks for now: checkout is a fake "pay" page and emails land in the in-app Outbox. A production build (`npm start`) refuses to use them unless you set `ALLOW_MOCK_PROVIDERS=true`, so a real deployment can't hand out free plans by accident.

## Test it

```bash
npm test        # unit + integration + grading benchmark (Vitest, throwaway prisma/test.db)
npm run build   # production build + type check
npm run e2e     # Playwright end-to-end, builds and serves on :3100 with prisma/e2e.db
```

The first time you run e2e, install the browser with `npx playwright install chromium`.

## What's in it

| Feature | Where |
|---|---|
| Role intake chat → weighted scorecard | `/jobs/new`, `src/providers/ai/` |
| Job ad generator + inclusive-wording checker | job Setup → Job ad, `src/domain/wording.ts` |
| Mobile apply page (no account, resume optional) | `/apply/[slug]` |
| Work-sample grading with quoted evidence (rule-based, no API cost) | `src/domain/grading/`, `src/services/applications.ts` |
| Resume parsing (PDF/.txt, minor signal ≤10%) | `src/services/resume.ts` |
| Ranked, identity-hidden shortlist | `/jobs/[id]/candidates` |
| Advance / hold / reject (reason required) + emails | `src/services/decisions.ts`, `/outbox` |
| Pipeline board (drag or "Move to") | `/jobs/[id]/board` |
| INR billing: Trial, Starter ₹999, Growth ₹2,999, single job ₹399 (+18% GST) | `/settings/billing` |
| Team invites with roles, audit log | `/settings/team`, `/settings/audit` |
| Interview times; candidates book, change or cancel from an emailed link on their phone; `.ics` calendar files | job → Interviews, `/book/[token]`, `src/services/interviews.ts` |
| Team booking, "My interviews" and feedback due | candidate page, `/interviews` |
| Structured interviewer feedback (0–4 per skill, recommendation), hidden from other interviewers until theirs is in | candidate page → Interview feedback, `src/services/feedback.ts` |
| Offers: printable letter, candidate accepts (typed name) or declines from a link, then a person marks them hired | candidate page → Offer, `/offer/[token]`, `src/services/offers.ts` |

## Grading

Answers are graded by a deterministic rule-based grader, not an LLM, so grading costs nothing and the same answer always gets the same score. Each skill has a rubric of *concepts* (synonym groups and phrase patterns such as "tell the supervisor"), *red flags* (unsafe or dishonest actions, which cap the skill at 1), and general quality signals (clear steps, concrete detail). It understands negation ("I would **never** force her" is good, "force the medicine" is not), common Indian English phrasing, and spots keyword stuffing. Custom roles fall back to a rubric built from the scorecard's keywords.

It's checked against a hand-labelled benchmark of 142 answers (`tests/benchmark/`, rubric in `tests/benchmark/RUBRIC.md`) on every `npm test`:

| Set | Within ±1 | Exact | Rank correlation | Unsafe answers kept ≤ 1 |
|---|---|---|---|---|
| Template roles, held-out answers | 94.3% | 65.7% | 0.90 | 100% |
| Template roles, tuning answers | 99.0% | 65.6% | 0.91 | 100% |
| Custom role ("Kitchen helper") | 87.5% | 55.0% | 0.86 | — |
| Previous keyword-count mock (held-out) | 70.0% | 35.7% | 0.52 | 100% |

The labels and the rules were written by the same author, so the held-out split is the honest number; an independent re-label would make it stronger.

## Compliance built in

- Candidate personal data is encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`).
- Reviewers see `Candidate #A7F2` and redacted evidence until someone shortlists the candidate.
- No automatic rejections: only a logged-in person can change a stage, and rejection requires a reason.
- Every score, stage change, reveal, scorecard edit, publish and plan change is written to an append-only audit log.
- Candidate text is treated as data. Prompt-injection attempts are flagged for the reviewer and never change the score.

## Security

- Every query is scoped to the signed-in user's organisation, and role checks (Admin, Recruiter, Hiring Manager, Interviewer) run in the service layer, not just the UI.
- Sessions are random tokens stored only as SHA-256 hashes, in an `httpOnly`, `SameSite=Lax` cookie that is `Secure` when `APP_URL` is https. Passwords use bcrypt.
- Rate limits: 10 login attempts per account per 15 minutes, 10 sign-ups and 30 applications per IP per hour. Login takes the same time whether or not the email exists.
- Per-request nonce Content-Security-Policy (`src/middleware.ts`), plus `X-Frame-Options`, `nosniff`, `Referrer-Policy: same-origin` (invite and checkout links carry secrets), HSTS and a locked-down `Permissions-Policy`.
- The Outbox shows candidate emails only to roles that make decisions, and team-invite links only to admins.
- Resume uploads are capped at 5 MB and refused before they're read into memory.

Before deploying: serve over HTTPS behind a proxy that sets `X-Forwarded-For`, generate a fresh `ENCRYPTION_KEY`, and keep the database file outside the web root. Rate limits live in memory, so move them to a shared store before running more than one instance.

## Layout

```
src/domain/     pure rules: scoring, stages, billing math, wording, redaction, injection
src/services/   use cases; the only code that touches the database and providers
src/providers/  interfaces + mock AI, email and billing
src/app/        Next.js pages, server actions and the apply API route
tests/          unit, integration and e2e
```

## Data retention

Each organisation keeps candidate data for a set period (default 365 days, adjustable from 30 days to 3 years under **Settings → Privacy**). A candidate whose applications have all been inactive for longer than that is erased for good: personal details, answers, resume, evidence and the Outbox emails sent to them. The audit log stays: it records IDs, stages, scores and reason codes, and any free-text decision notes about an erased candidate are removed. Every change of period and every erasure is itself audited.

Run the job daily from cron:

```bash
15 2 * * *  cd /srv/talentsift && npm run retention
```

Admins can also preview what the next run would erase and run it from the Privacy page.

## Interviews and offers

All interview times are entered and shown in India time (`Asia/Kolkata`) and stored in UTC. Moving a candidate to **Interview** emails them a booking link (valid 14 days); if the job has no open times yet, the email says the team will call. Candidates can change or cancel up to 12 hours before the start. Booking never changes a candidate's stage, and an accepted offer doesn't mark anyone hired: both stay human, audited decisions. Calendar invites are plain `.ics` files, so there's no calendar API to pay for.

Salaries, feedback notes and offer terms never go into the audit log, and interviews, feedback, offers and candidate links are erased with the application by the retention job. Every booking, feedback or offer reply counts as activity, so a candidate in an active process isn't purged.

## Swapping in real providers

The AI, email and billing providers are interfaces in `src/providers/types.ts`, and they're chosen in `src/lib/providers.ts`. Grading uses `RuleBasedAIProvider` (scorecard, job-ad and resume generation still come from the mock). If you later want LLM grading, add a Claude provider (`claude-sonnet-5-5` for grading, `claude-haiku-5-5` for parsing) and run it against the same benchmark. For going live you'd also add a Resend email provider and a Razorpay billing provider. No service code changes. To move to Postgres, change `provider` in `prisma/schema.prisma` and set `DATABASE_URL`.

## Not built yet

Still to build: chat screening (web only, SMS needs a paid provider), interview panels (one interviewer per slot today), calendar sync and automatic reminders, e-signature and offer approval chains, integrations, and SOC 2 readiness. Data retention, hiring analytics, the fairness monitor (`/analytics`), interview scheduling, feedback and offers are built.
