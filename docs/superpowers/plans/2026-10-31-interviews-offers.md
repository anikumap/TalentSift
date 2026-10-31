# Interviews, Feedback and Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take a shortlisted candidate through interview booking, interviewer feedback, an offer, and hire, inside TalentSift.

**Architecture:** Pure helpers live in `src/domain/` (slot maths, `.ics`, offer validation). Services live in `src/services/` and own all permission checks, transactions and audit. Next.js pages and server actions are thin. Candidates act through hashed token links (`CandidateLink`), as team invites already do. Stage changes go through one transactional helper shared by every caller.

**Tech Stack:** Next.js 15 App Router, Prisma + SQLite, Zod, Vitest (integration against `prisma/test.db`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-interviews-offers-design.md` (read it first; its "Implementation constraints" section is binding).

## Global Constraints

- No paid services. Calendar invites are `.ics` files. Emails go through `getProviders().email` (the Outbox mock).
- Commit messages are plain conventional commits. **No `Co-Authored-By` or any Claude attribution line.**
- All displayed and entered times are `Asia/Kolkata`, and stored in UTC. Tests run with `TZ=UTC`.
- Only a team member changes `Application.stage`, always via `applyStageChange`, always audited.
- Every write to an interview, feedback, link or offer also bumps `Application.updatedAt` in the same transaction.
- Audit events for these features use `entityType: "Application"` and `entityId: applicationId`. They never contain salary, notes or terms.
- New Outbox kinds: `CANDIDATE_INTERVIEW_LINK`, `CANDIDATE_INTERVIEW_CONFIRMED`, `CANDIDATE_INTERVIEW_CANCELLED`, `CANDIDATE_OFFER`, `CANDIDATE_OFFER_WITHDRAWN`.
- Links: `${process.env.APP_URL ?? ""}/book/<token>` and `/offer/<token>`. Booking links expire after 14 days. Offer links expire at 23:59:59 IST on `respondBy`.
- Never run two Vitest runs at once (they share `prisma/test.db`). Stop the dev server before `prisma db push` (Windows holds the engine DLL).

## Review Focus

1. **Two candidates click the same slot at once.** Exactly one booking succeeds and the other sees "just taken" plus the remaining times. Pinned in Task 3 (`race on one slot`).
2. **The candidate opens an old booking link after being rejected or hired.** The page says the position is no longer open and booking is refused. Pinned in Task 3 (`closed application`).
3. **A slot entered as "10:00" on an IST date shows as 10:00 IST everywhere**, including the `.ics` file (04:30Z). Pinned in Task 2 (`IST boundaries`) and Task 2 (`ics times`).
4. **An interviewer tries to give feedback on someone else's interview, or before it has started.** Refused. Pinned in Task 5.
5. **An offer link is used after `respondBy`, or used twice.** "Expired" or "already answered", and no change. Pinned in Task 7.

---

## Phase A — Slots and booking

### Task 1: Transactional stage change, RBAC actions, schema, TZ

**Files:**
- Modify: `src/services/decisions.ts`
- Modify: `src/lib/rbac.ts`
- Modify: `prisma/schema.prisma`: add `InterviewSlot`, `Interview`, `Feedback`, `CandidateLink` and `Offer` exactly as in the spec, plus back-relations on `Application` (`interviews`, `links`, `offers`, all `onDelete: Cascade`), `Job.slots` and `User.slots`
- Modify: `src/domain/constants.ts`: add these `AUDIT_ACTIONS`: `INTERVIEW_SLOTS_ADDED`, `INTERVIEW_BOOKED`, `INTERVIEW_CANCELLED`, `INTERVIEW_STATUS_CHANGED`, `FEEDBACK_SUBMITTED`, `OFFER_SENT`, `OFFER_RESPONDED`, `OFFER_WITHDRAWN`. Also add `INTERVIEW_MODES = ["IN_PERSON","PHONE","VIDEO"]`, `RECOMMENDATIONS = ["STRONG_YES","YES","NO","STRONG_NO"]`, and label maps for both.
- Modify: `vitest.config.mts`: `testEnv.TZ = "UTC"`
- Modify: `src/services/retention.ts`: strip notes on `STAGE_CHANGED`, `OFFER_WITHDRAWN` and `INTERVIEW_CANCELLED`
- Test: `tests/unit/rbac.test.ts`, `tests/integration/decisions.test.ts` (existing, must stay green), `tests/integration/retention.test.ts`

**Interfaces:**
- Produces: `applyStageChange(tx: Prisma.TransactionClient, actor: Actor, app: { id: string; jobId: string; stage: string; revealed: boolean }, toStage: Stage, reasonText: string | null): Promise<void>`. It validates `canTransition`, updates the stage and reveal, and writes the `STAGE_CHANGED` and `IDENTITY_REVEALED` audit rows. `changeStage` keeps its signature and uses it.
- Produces: `Action` gains `"interview.view"` (all four roles) and `"interview.manage"` (ADMIN, RECRUITER, HIRING_MANAGER).

- [ ] **Step 1: Add the failing RBAC test.** `it("lets everyone see interviews but only deciders manage them")` asserts `can(r,"interview.view")` is true for all four roles, and `can("INTERVIEWER","interview.manage")` is false while it's true for ADMIN, RECRUITER and HIRING_MANAGER.
- [ ] **Step 2: Add the failing retention test** `strips free-text reasons from offer and interview audit events of erased candidates`. It inserts an `OFFER_WITHDRAWN` audit row with `entityId = app.id` and `reason = "Budget cut for Meena"` for an aged application, purges, and expects `reason` to be `null`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/rbac.test.ts tests/integration/retention.test.ts`. Expect 2 failures.
- [ ] **Step 4: Implement** the RBAC actions, the retention action list (`action: { in: [...] }`), the schema, the constants, `TZ`, and extract `applyStageChange`.
- [ ] **Step 5: Stop the dev server, then run** `npx prisma db push` and `npm test`. Expect all to pass, with the decisions tests unchanged.
- [ ] **Step 6: Commit** `refactor: transactional stage change; interview schema and permissions`.

### Task 2: Domain helpers for slots, time and `.ics`

**Files:**
- Create: `src/domain/interviews.ts`
- Test: `tests/unit/interviews.test.ts`

**Interfaces:**
- Produces:
  - `IST = "Asia/Kolkata"`
  - `istToUtc(date: string /*YYYY-MM-DD*/, time: string /*HH:MM*/): Date` (fixed +05:30, India has no DST)
  - `slotTimes(date: string, from: string, to: string, lengthMin: number): Date[]`
  - `overlaps(a: {startsAt: Date; durationMin: number}, b: same): boolean`
  - `canCandidateChange(startsAt: Date, now: Date): boolean` (true iff `startsAt - now >= 12h`)
  - `istDateTime(d: Date): string`, e.g. "Tue, 4 Nov, 10:00 am"
  - `istDayKey(d: Date): string` (YYYY-MM-DD in IST, for grouping)
  - `toIcs(e: { uid: string; startsAt: Date; durationMin: number; summary: string; location: string; description: string }): string`
  - `MAX_SLOTS_PER_BATCH = 32` and `CHANGE_WINDOW_HOURS = 12`

- [ ] **Step 1: Write the failing tests:**
  - `IST boundaries`: `istToUtc("2026-11-04","10:00").toISOString() === "2026-11-04T04:30:00.000Z"` and `istToUtc("2026-11-04","03:00")` is `2026-11-03T21:30Z`
  - `slotTimes("2026-11-04","10:00","11:40",30)` has length 3 (a partial last slot is dropped)
  - `from >= to` gives `[]`
  - a 9:00–18:00 day at 15 min gives 36 slots (the cap is applied in the service, not here)
  - `overlaps` touching at the edge is false, and 1 minute of overlap is true
  - `canCandidateChange` at exactly 12h is true, and 12h − 1ms is false
  - `istDateTime(new Date("2026-11-04T04:30:00Z"))` contains "10:00"
  - `ics times`: the output contains `DTSTART:20261104T043000Z` and `DTEND:20261104T050000Z` for 30 min, every line ends `\r\n`, and `location: "Flat 2, Kothrud; Pune\nGate B"` is escaped to `Flat 2\, Kothrud\; Pune\nGate B`
- [ ] **Step 2: Run** `npx vitest run tests/unit/interviews.test.ts`. Expect FAIL (module missing).
- [ ] **Step 3: Implement.** Use `Intl.DateTimeFormat("en-IN", { timeZone: IST, ... })` for formatting. `.ics` is VCALENDAR/VEVENT with `PRODID:-//TalentSift//EN`, `METHOD:PUBLISH`, and `DTSTAMP` = `startsAt` (deterministic).
- [ ] **Step 4: Run** the tests again. Expect PASS.
- [ ] **Step 5: Commit** `feat: interview time and calendar helpers`.

### Task 3: Interviews service — slots, links, booking

**Files:**
- Create: `src/services/candidateLinks.ts`, `src/services/interviews.ts`
- Modify: `src/services/emails.ts`: add `bookingLinkEmail(name, jobTitle, orgName, url | null)` (null means "we'll call you"), `interviewConfirmedEmail(name, jobTitle, orgName, when: string, mode: string, location: string)` and `interviewCancelledEmail(name, jobTitle, orgName)`
- Modify: `src/services/decisions.ts`: when `toStage === "INTERVIEW"`, issue the booking link inside the transaction and send `bookingLinkEmail` after commit, with no invite/rejection email for that stage
- Test: `tests/integration/interviews.test.ts`

**Interfaces:**
- Consumes: `applyStageChange` and the helpers from Task 2.
- Produces:
  - `issueLink(tx, applicationId: string, purpose: "BOOKING"|"OFFER", expiresAt: Date): Promise<string /*raw token*/>`
  - `resolveLink(token: string, purpose): Promise<{ applicationId: string } | null>` (null if unknown or expired)
  - `addSlots(actor, jobId, input: { date; from; to; lengthMin; interviewerId; mode; location }): Promise<number>`
  - `deleteSlot(actor, slotId): Promise<void>`
  - `listSlots(actor, jobId): Promise<SlotRow[]>` with `SlotRow = { id; startsAt; durationMin; mode; location; interviewerName; booked: { appId; displayName } | null }`
  - `getBookingPage(token): Promise<BookingPage>` with `BookingPage = { state: "invalid" } | { state: "closed"; orgName; jobTitle } | { state: "choose"; orgName; jobTitle; slots: { id; startsAt; durationMin; mode }[] } | { state: "booked"; orgName; jobTitle; interview: { id; startsAt; durationMin; mode; location; canChange: boolean }; slots: same as choose }`
  - `bookByToken(token, slotId): Promise<void>` (cancels an existing changeable interview in the same transaction)
  - `cancelByToken(token): Promise<void>`
  - `bookForCandidate(actor, appId, slotId): Promise<void>`
  - `cancelInterview(actor, interviewId, reason?: string): Promise<void>`
  - `setInterviewStatus(actor, interviewId, status: "COMPLETED"|"NO_SHOW"): Promise<void>`
  - `listInterviewsForApp(actor, appId)`
  - `listMyInterviews(actor, { mineOnly: boolean, now?: Date }): Promise<{ upcoming: Row[]; feedbackDue: Row[] }>`
  - `interviewIcs(actor, interviewId): Promise<string>` and `interviewIcsByToken(token): Promise<string | null>`

- [ ] **Step 1: Write the failing integration tests** (use `makeAdmin`, `addMember`, and a helper that applies and moves to SHORTLISTED → INTERVIEW):
  - `adds back-to-back slots in IST and audits once`: 10:00–12:00 at 30 min gives 4 slots, the first `startsAt` is `04:30Z`, and there's one `INTERVIEW_SLOTS_ADDED` row
  - `rejects overlapping, past, foreign-interviewer, over-32 and interviewer-role slot creation` (`VALIDATION`/`VALIDATION`/`VALIDATION`/`VALIDATION`/`FORBIDDEN`)
  - `moving to Interview emails a booking link` (the Outbox has `CANDIDATE_INTERVIEW_LINK` whose body contains `/book/`), and with no slots the body contains "call you"
  - `candidate books by token`: the interview is created with `bookedBy "CANDIDATE"`, the confirmation email is sent, `Application.updatedAt` advances, the audit `INTERVIEW_BOOKED` has `entityId = appId` and `actorName "Candidate"`, and `getBookingPage` is `state "booked"`
  - `race on one slot`: two applications, `Promise.allSettled([bookByToken(t1,s), bookByToken(t2,s)])` gives one fulfilled and one rejected with code `CONFLICT`
  - `change time inside 12h is refused, outside is allowed and frees the old slot`
  - `invalid and expired tokens`: `getBookingPage("nope").state === "invalid"`, and an expired link (update `expiresAt` to the past) is also invalid
  - `closed application`: after REJECTED, the page is `state "closed"` and `bookByToken` throws `CONFLICT`
  - `team booking and cancel`: `bookForCandidate` gives `bookedBy "TEAM"`, `cancelInterview` frees the slot, the interviewer role gets `FORBIDDEN`
  - `ics by token contains the location only after booking`
  - `retention erases interviews and links`
- [ ] **Step 2: Run** `npx vitest run tests/integration/interviews.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - A token is `randomBytes(24).toString("base64url")` stored as `sha256` (reuse the helper used by `services/auth.ts`).
  - `issueLink` uses `upsert` on `[applicationId, purpose]`.
  - Map Prisma `P2002` on `slotId` to `AppError("CONFLICT", "Sorry, someone just took that time. Please pick another.")`.
  - Booking is refused unless the application stage is `INTERVIEW` (otherwise `closed`).
  - Interview location is shown to the candidate only once booked.
- [ ] **Step 4: Run** the integration tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Commit** `feat: interview slots, booking links and booking service`.

### Task 4: Phase A UI — slot manager, booking page, candidate page section, My interviews

**Files:**
- Create: `src/app/(app)/jobs/[id]/interviews/page.tsx` and `SlotForm.tsx` (tab "Interviews" added to `JobNav.tsx`, with the slot count in place of the applicant count)
- Create: `src/app/actions/interviews.ts`: server actions wrapping the Task 3 services with `runAction` plus `revalidatePath`. The public actions rate-limit with `allow(\`book:${ip}\`, 20, 60*60_000)`.
- Create: `src/app/book/[token]/page.tsx`, `BookingFlow.tsx`, and `src/app/book/[token]/ics/route.ts`
- Create: `src/app/api/interviews/[id]/ics/route.ts` (requires a session, uses `interviewIcs`)
- Create: `src/components/candidates/InterviewsPanel.tsx` (on the candidate page: list, book-for-candidate select of open slots, cancel, mark completed/no-show after start, *Send booking link*)
- Create: `src/app/(app)/interviews/page.tsx`. Add a nav item "Interviews" for all roles in `src/app/(app)/layout.tsx`.
- Modify: `src/app/(app)/settings/audit/page.tsx` and `src/lib/format.ts`: labels for the new audit actions
- Test: `tests/e2e/interviews.spec.ts` (Phase A part)

- [ ] **Step 1: Write the e2e test** `recruiter adds slots and a candidate books from the emailed link on a phone`:
  1. log in as admin (the existing e2e helpers), apply a candidate
  2. shortlist them, add slots for tomorrow 10:00–11:00
  3. move them to Interview
  4. open the Outbox and follow the `/book/` link in a 390×844 context
  5. pick the first time and confirm; the page shows "You're booked" and an "Add to calendar" link
  6. `/interviews` lists the interview
- [ ] **Step 2: Build the pages and actions.** Follow the existing UI primitives (`panel`, `btn-*`, `field`, `label`, `PageHeader`, `Notice`) and the mobile-first apply page for `/book`.
- [ ] **Step 3: Run** `npm run build`, then `npx playwright test tests/e2e/interviews.spec.ts`. Expect PASS.
- [ ] **Step 4: Manual check** in a headed browser against `npm run dev` (screenshots of the slot manager, the booking page on mobile and `/interviews`). Fix anything visibly off.
- [ ] **Step 5: Commit** `feat: interview scheduling UI and candidate booking page`.

## Phase B — Feedback

### Task 5: Feedback service

**Files:**
- Create: `src/services/feedback.ts`
- Test: `tests/integration/feedback.test.ts`

**Interfaces:**
- Produces:
  - `submitFeedback(actor, interviewId, input: { ratings: Record<string /*skillId*/, number>; recommendation; notes }): Promise<void>`
  - `getFeedback(actor, appId): Promise<{ visible: FeedbackView[]; hiddenCount: number; mineDue: string[] /*interviewIds*/ }>` with `FeedbackView = { interviewId; interviewerName; startsAt; recommendation; notes; ratings: { skillId; name; rating }[] }`

- [ ] **Step 1: Write the failing tests:**
  - `only the assigned interviewer, only after the start` (another interviewer gets `FORBIDDEN`; before `startsAt` gets `VALIDATION`)
  - `requires a 0–4 rating for every current scorecard skill` (missing or 5 gives `VALIDATION`)
  - `stores a name snapshot that survives removing the skill`
  - `marks the interview completed, bumps activity, audits without notes` (audit JSON doesn't contain the notes text)
  - `cannot submit twice` (`CONFLICT`)
  - `independent visibility`: with two interviews and two interviewers, interviewer A sees `hiddenCount 1` and no views before submitting, and 2 views after; a recruiter always sees all
  - `cancelled interviews take no feedback`
- [ ] **Step 2: Run** `npx vitest run tests/integration/feedback.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** Notes max 2000, trimmed.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Commit** `feat: interviewer feedback with independent visibility`.

### Task 6: Feedback UI

**Files:**
- Create: `src/components/candidates/FeedbackPanel.tsx` (form for `mineDue`: one 0–4 radio group per skill with the labels None/Weak/Some/Good/Strong, a recommendation select, notes; plus a list of visible feedback next to the grader's skill scores)
- Modify: `src/app/(app)/candidates/[appId]/page.tsx` (render `InterviewsPanel` and `FeedbackPanel`), `src/app/actions/interviews.ts` (`submitFeedbackAction`)
- Modify: `/interviews` page: the "Feedback due" rows link to `/candidates/[appId]#feedback`
- Test: `tests/e2e/interviews.spec.ts`: extend with `interviewer submits feedback` (the spec moves the booked interview's `startsAt` into the past with a direct Prisma update on `prisma/e2e.db`)

- [ ] **Step 1: Extend the e2e:** after booking, the spec moves the interview's `startsAt` to one hour ago via Prisma (`prisma/e2e.db`). It logs in as the interviewer (invite one in setup), opens `/interviews`, clicks the due row, fills the ratings, chooses "Yes" and submits. Then "Your feedback is in" is visible.
- [ ] **Step 2: Implement the UI.**
- [ ] **Step 3: Run** `npm run build && npx playwright test tests/e2e/interviews.spec.ts`. Expect PASS.
- [ ] **Step 4: Commit** `feat: feedback form and panel on the candidate page`.

## Phase C — Offers

### Task 7: Offers service

**Files:**
- Create: `src/domain/offers.ts`, `src/services/offers.ts`
- Modify: `src/services/emails.ts`: `offerEmail(name, jobTitle, orgName, url, respondBy: string)` and `offerWithdrawnEmail(name, jobTitle, orgName)`
- Test: `tests/unit/offers.test.ts`, `tests/integration/offers.test.ts`

**Interfaces:**
- Produces:
  - `validateOfferInput(input: { monthlyPay: number; startDate: string; respondBy: string }, now: Date): Record<string,string>` (field errors, empty when valid)
  - `offerLinkExpiry(respondBy: string /*YYYY-MM-DD*/): Date` (23:59:59.999 IST that day)
  - `payOutsideRange(pay, min, max): boolean`
  - `createOffer(actor, appId, input: { monthlyPay: number; startDate: string; respondBy: string; terms: string }): Promise<string /*offerId*/>`
  - `withdrawOffer(actor, offerId, reason: string): Promise<void>`
  - `getOfferPage(token): Promise<{ state: "invalid" } | { state: "expired" | "answered" | "open"; letter: OfferLetter }>` with `OfferLetter = { orgName; candidateName; jobTitle; location; shifts; monthlyPay; startDate; respondBy; terms; status; signedName }`
  - `respondToOffer(token, r: { accept: true; signedName: string } | { accept: false; reason?: string }): Promise<void>`
  - `getOffersForApp(actor, appId)`
  - `markHired(actor, appId): Promise<void>` (requires an ACCEPTED offer, then `applyStageChange` to HIRED)

- [ ] **Step 1: Write the failing unit tests:**
  - pay `0`, `-1` and `1.5` are errors
  - a start date before today (IST) is an error
  - `respondBy` today is an error, tomorrow is fine, 31 days out is an error
  - `offerLinkExpiry("2026-11-10").toISOString() === "2026-11-10T18:29:59.999Z"`
- [ ] **Step 2: Write the failing integration tests:**
  - `creates an offer at Interview, moves to Offer, emails a link, all-or-nothing`: force failure with invalid input and the stage is unchanged
  - `refuses from Shortlisted, refuses a second live offer, refuses interviewer role`
  - `accept records the typed name, bumps activity and audits without salary` (audit JSON doesn't contain the pay digits)
  - `decline with reason`
  - `answered and expired links don't change anything`
  - `withdraw needs a reason, emails, then a new offer is allowed`
  - `markHired only after acceptance`
  - `retention erases offers`
- [ ] **Step 3: Run** both test files. Expect FAIL.
- [ ] **Step 4: Implement.** `createOffer` does the stage change (`applyStageChange` to OFFER if not already there), the offer row, `issueLink(..., "OFFER", offerLinkExpiry(respondBy))`, the activity bump and the `OFFER_SENT` audit in one transaction, then sends the email.
- [ ] **Step 5: Run** them again, then `npm test`. Expect PASS.
- [ ] **Step 6: Commit** `feat: offers with candidate accept/decline links`.

### Task 8: Offer UI, end-to-end journey, docs

**Files:**
- Create: `src/components/candidates/OfferPanel.tsx`: the form, with an inline warning when `payOutsideRange`, the current offer status, withdraw with a reason, and *Mark hired* when accepted
- Create: `src/app/offer/[token]/page.tsx` and `OfferResponse.tsx` (a printable letter with `@media print` hiding the buttons). Public actions are rate-limited with `allow(\`offer:${ip}\`, 20, 60*60_000)`.
- Modify: the candidate page, `src/app/actions/interviews.ts` (or a new `actions/offers.ts`), seed (one candidate with a booked interview, feedback, and an accepted offer), README (the feature table and "Not built yet"), and `HANDOFF.md`
- Test: `tests/e2e/interviews.spec.ts`: extend to the full journey

- [ ] **Step 1: Extend the e2e:** the recruiter sends an offer (pay 20000, start in 7 days, respond in 3). The candidate opens `/offer/` from the Outbox on a phone, types their name, ticks the box and accepts. The recruiter sees "Accepted", clicks *Mark hired*, and the stage badge reads "Hired". Also check that reopening the offer link shows "already answered".
- [ ] **Step 2: Implement the UI, seed, README and HANDOFF.**
- [ ] **Step 3: Run** `npm test && npm run build && npm run e2e`. Expect everything to pass.
- [ ] **Step 4: Manual headed-browser pass** over the full journey with screenshots.
- [ ] **Step 5: Commit** `feat: offer letter page and full hiring journey`.

### Task 9: Fresh review

- [ ] Run a fresh code review over the branch since the spec commit (public token routes, permissions, transactions, retention). Fix confirmed findings with regression tests, run `npm test && npm run build && npm run e2e`, and commit `fix: review findings for interviews and offers`.
