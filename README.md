# TalentSift

Evidence-based hiring for hourly roles (home care, logistics, retail). A hiring manager describes a role in a short chat, applicants answer real job situations on their phone, and the team gets a ranked shortlist with quoted evidence. Names stay hidden until a person decides to shortlist someone.

This is the foundation and the Phase 1 MVP.

## Run it

Requires Node 20+ (tested on Node 24).

```bash
npm install
cp .env.example .env          # then set ENCRYPTION_KEY (command is in the file)
npm run db:push               # creates prisma/dev.db (SQLite)
npm run seed                  # optional demo data
npm run dev                   # http://localhost:3000
```

Demo login after seeding: `admin@demo.test` / `demo1234`.

## Test it

```bash
npm test        # unit + integration (Vitest, throwaway prisma/test.db)
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
| Work-sample grading with quoted evidence | `src/services/applications.ts` |
| Resume parsing (PDF/.txt, minor signal ≤10%) | `src/services/resume.ts` |
| Ranked, identity-hidden shortlist | `/jobs/[id]/candidates` |
| Advance / hold / reject (reason required) + emails | `src/services/decisions.ts`, `/outbox` |
| Pipeline board (drag or "Move to") | `/jobs/[id]/board` |
| INR billing: Trial, Starter ₹999, Growth ₹2,999, single job ₹399 (+18% GST) | `/settings/billing` |
| Team invites with roles, audit log | `/settings/team`, `/settings/audit` |

## Compliance built in

- Candidate personal data is encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`).
- Reviewers see `Candidate #A7F2` and redacted evidence until someone shortlists the candidate.
- No automatic rejections: only a logged-in person can change a stage, and rejection requires a reason.
- Every score, stage change, reveal, scorecard edit, publish and plan change is written to an append-only audit log.
- Candidate text is treated as data. Prompt-injection attempts are flagged for the reviewer and never change the score.

## Layout

```
src/domain/     pure rules: scoring, stages, billing math, wording, redaction, injection
src/services/   use cases; the only code that touches the database and providers
src/providers/  interfaces + mock AI, email and billing
src/app/        Next.js pages, server actions and the apply API route
tests/          unit, integration and e2e
```

## Swapping in real providers

The AI, email and billing providers are interfaces in `src/providers/types.ts`, and they're chosen in `src/lib/providers.ts`. To go live, add a Claude provider (`claude-sonnet-5-5` for grading, `claude-haiku-5-5` for parsing), a Resend email provider and a Razorpay billing provider. No service code changes. To move to Postgres, change `provider` in `prisma/schema.prisma` and set `DATABASE_URL`.

## Not built yet

Phases 2–6 of the plan: AI chat/SMS screens, scheduling, interviews and offers, integrations, analytics, the bias monitor, and SOC 2. The data-retention setting is stored, but the job that enforces it hasn't been built yet.
