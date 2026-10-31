# Interviews, interviewer feedback and offers — design

Date: 2026-10-31
Status: self-approved by the implementer under the user's standing instruction ("full autonomy over this project"). Review before merge.

## Goal

Take a shortlisted candidate through to a hire without leaving TalentSift:

1. the team publishes interview times and the candidate books one from a link on their phone (or a team member books it for them over the phone);
2. the interviewer records structured feedback against the job's skills;
3. the team sends an offer the candidate accepts or declines from a link, and a person then marks them hired.

Constraints: no paid services (no SMS, no calendar API; calendar invites are plain `.ics` files), candidates never get accounts, every stage change stays a human team decision and is audited, and everything personal must be erased by the retention purge.

## Decisions made without the user (please sanity-check)

- **Booking does not change stage.** Moving a candidate to *Interview* (an existing team action) is what sends the booking link. The candidate booking only creates an `Interview` row. This keeps "only a team member changes stage" true.
- **Offer acceptance does not mark them hired.** Acceptance is recorded and highlighted; a team member clicks *Mark hired*. Same reason.
- **One interviewer per slot, one candidate per slot.** Panels are out of scope (YAGNI). A candidate can still have several interviews.
- **Independent feedback.** An interviewer sees other interviewers' feedback on the same candidate only after submitting their own. Admins, recruiters and hiring managers see all feedback.
- **All times are India Standard Time.** Slot times are entered and shown in `Asia/Kolkata`, stored in UTC.
- **Reschedule window.** Candidates can cancel or rebook up to 12 hours before the start. After that the page says to reply to the email.
- **Salary is not written to the audit log.** Audit events hold the offer ID and status only.

## Data model (Prisma)

```prisma
model InterviewSlot {
  id            String     @id @default(cuid())
  jobId         String     // job -> Cascade
  interviewerId String     // User -> Cascade
  startsAt      DateTime
  durationMin   Int        // 15..240
  mode          String     // IN_PERSON | PHONE | VIDEO
  location      String     // address, phone number or video link; shown to the candidate once booked
  createdAt     DateTime   @default(now())
  interview     Interview?
  @@index([jobId, startsAt])
}

model Interview {
  id            String         @id @default(cuid())
  applicationId String         // Application -> Cascade
  slotId        String?        @unique   // null once cancelled, freeing the slot; unique => no double booking
  interviewerId String
  startsAt      DateTime       // copied from the slot so history survives slot deletion
  durationMin   Int
  mode          String
  location      String
  status        String         @default("SCHEDULED") // SCHEDULED | CANCELLED | COMPLETED | NO_SHOW
  bookedBy      String         // CANDIDATE | TEAM
  createdAt     DateTime       @default(now())
  feedback      Feedback?
}

model Feedback {
  id             String    @id @default(cuid())
  interviewId    String    @unique   // Interview -> Cascade
  interviewerId  String
  ratings        String    // JSON { [skillId]: 0..4 }
  recommendation String    // STRONG_YES | YES | NO | STRONG_NO
  notes          String    // <= 2000 chars, may be empty
  createdAt      DateTime  @default(now())
}

model CandidateLink {      // one-time-ish token links for candidates
  id            String    @id @default(cuid())
  applicationId String    // Application -> Cascade
  purpose       String    // BOOKING | OFFER
  tokenHash     String    @unique
  expiresAt     DateTime
  createdAt     DateTime  @default(now())
  @@unique([applicationId, purpose])   // reissuing replaces the old link
}

model Offer {
  id            String    @id @default(cuid())
  applicationId String    // Application -> Cascade
  monthlyPay    Int       // rupees
  startDate     DateTime
  respondBy     DateTime
  terms         String    // <= 2000 chars, may be empty
  status        String    @default("SENT") // SENT | ACCEPTED | DECLINED | WITHDRAWN
  signedName    String?   // typed by the candidate on acceptance
  declineReason String?   // <= 500 chars
  respondedAt   DateTime?
  createdAt     DateTime  @default(now())
  createdById   String
}
```

At most one offer per application is `SENT` or `ACCEPTED` at a time (enforced in the service).

## Flows

### Slots
`addSlots(actor, jobId, { date, from, to, lengthMin, interviewerId, mode, location })` creates back-to-back slots between `from` and `to` on `date` (IST). Rules: `stage.change` permission, the job is in the actor's org, the interviewer is a member of the org (any role), length 15–240, at most 32 slots per call, and no new slot may overlap an existing slot for the same interviewer. Slots in the past are rejected. Unbooked slots can be deleted; booked ones can't (cancel the interview instead). Audited `INTERVIEW_SLOTS_ADDED` with the count.

### Sending the booking link
When `changeStage` moves an application to `INTERVIEW`, it issues a `BOOKING` link (14 days) and the email changes from the generic one to *"Choose a time for your interview"* containing `/book/<token>`. If the job has no open future slots, the email says the team will call to arrange a time. A team member can resend the link from the candidate page (*Send booking link*), which replaces the old token.

### Candidate booking page `/book/[token]` (public, mobile-first)
- Invalid or expired token: a friendly "this link has expired, reply to the email" page.
- No interview yet: open future slots for the job grouped by day, then confirm. Booking is one transaction. If the slot was taken in the meantime (unique `slotId` violation), the page says so and shows the remaining times.
- Interview booked: shows when, how (mode and location), and buttons to *Add to calendar* (`.ics`), *Change time* and *Cancel*. Change and cancel are allowed until 12 hours before the start.
- Booking sends a `CANDIDATE_INTERVIEW_CONFIRMED` email with the details. Cancelling frees the slot (`slotId = null`, status `CANCELLED`).
- Rate limited by IP like the apply route.

### Team booking
On the candidate page, a team member can book any open slot for the candidate (`bookedBy: TEAM`), cancel an interview, or mark it `COMPLETED` or `NO_SHOW` once its start time has passed. The candidate gets the same confirmation email.

### Feedback
The assigned interviewer (and only them) submits feedback once the interview has started: a 0–4 rating for each skill on the job's scorecard (same scale as the grader), a recommendation, and optional notes. Submitting marks the interview `COMPLETED`. Feedback can't be edited after submission (it's evidence). The candidate page shows a *Interview feedback* section with each interviewer's ratings next to the grader's scores.

Visibility (`getFeedback(actor, appId)`): `stage.change` roles see all; an interviewer sees their own, and sees others' only once theirs is in; otherwise they see "2 interviewers have submitted feedback".

### Offers
`createOffer(actor, appId, { monthlyPay, startDate, respondBy, terms })`: `stage.change` permission, the application is at `INTERVIEW` or `OFFER`, no other live offer, pay is a positive whole number of rupees, the start date is today or later, and `respondBy` is between tomorrow and 30 days from now. It calls `changeStage(..., "OFFER")` (still a human, still audited), issues an `OFFER` link that expires at `respondBy` end of day, and sends `CANDIDATE_OFFER` with the link. The UI shows a warning (not an error) when the pay is outside the job's advertised range.

`/offer/[token]` (public): a printable offer letter (org, role, location, pay, start date, shifts, terms, respond-by date) with *Accept* (typed full name plus a confirmation checkbox) and *Decline* (optional reason). After `respondBy` it shows "This offer has expired". Responding is final. Accepting records `signedName` and `respondedAt`.

The team can withdraw a `SENT` offer (reason required, sends a polite email). On the candidate page an accepted offer shows a prominent *Mark hired* button, which calls `changeStage(..., "HIRED")`.

### My interviews `/interviews`
For every role: upcoming scheduled interviews (an interviewer sees their own; other roles see all, with a "Mine only" toggle) and *Feedback due* (past interviews assigned to me without feedback). Each row links to the candidate page. There's also an `.ics` download for each interview. A nav entry "Interviews" is shown to everyone.

## Retention and privacy

- `Interview`, `Feedback`, `Offer` and `CandidateLink` cascade from `Application`, so the existing purge erases them. Feedback notes and offer terms are free text and go with them.
- Every booking, cancellation, feedback and offer response updates `Application.updatedAt`, so a candidate in an active process is never purged.
- New email kinds all start with `CANDIDATE_` and are purged with the rest.
- Audit events (`INTERVIEW_SLOTS_ADDED`, `INTERVIEW_BOOKED`, `INTERVIEW_CANCELLED`, `INTERVIEW_STATUS_CHANGED`, `FEEDBACK_SUBMITTED`, `OFFER_SENT`, `OFFER_RESPONDED`, `OFFER_WITHDRAWN`) hold IDs, times and statuses only. Candidate-initiated events use `actorName: "Candidate"` with no actor ID. The offer withdrawal reason is a free-text reason, so the retention purge strips it like decision notes.

## Units

- `src/domain/interviews.ts`: pure helpers — `slotTimes(date, from, to, lengthMin)` in IST, `overlaps(a, b)`, `canCandidateChange(startsAt, now)`, `toIcs(event)`, `istDateTime(d)` formatting.
- `src/domain/offers.ts`: `validateOfferInput`, `offerLinkExpiry(respondBy)`, `payOutsideRange`.
- `src/services/interviews.ts`: slots, booking (team and by token), cancel, status, list for `/interviews`.
- `src/services/feedback.ts`: submit and visibility-aware read.
- `src/services/offers.ts`: create, withdraw, respond by token, mark hired via `changeStage`.
- `src/services/candidateLinks.ts`: issue (returns the raw token) and resolve tokens.
- Emails in `src/services/emails.ts`: booking link, confirmation, cancellation, offer, offer withdrawn.
- Pages: `/jobs/[id]/interviews` (slot manager, a new tab in the job nav), `/interviews`, `/book/[token]`, `/offer/[token]`, `/api/ics/[interviewId]` (team, authenticated) and `/book/[token]/ics` (candidate). Candidate page sections: Interviews, Interview feedback, Offer.

## Errors and edge cases

- Booking a slot that's already taken: `CONFLICT` with a friendly message (new `AppError` code if not present).
- Booking when the candidate already has a scheduled interview for this job via the token: the change-time flow cancels the old one and books the new one in one transaction.
- Booking or responding to an offer after the application is `REJECTED` or `HIRED`: the link page says the position is no longer open.
- Deleting an interviewer from the team is out of scope (there's no member removal today).
- Clock edge: "past" means `startsAt <= now`. The 12-hour rule is `startsAt - now >= 12h`.

## Testing

- Unit: slot generation (IST boundaries, length that doesn't divide the window, the 32 cap), overlap, the 12-hour rule, `.ics` output (CRLF line endings, UTC `Z` times, escaping commas, semicolons and newlines), offer validation.
- Integration:
  - slot rules (overlap, past, foreign interviewer, permission)
  - moving to Interview issues a link and the right email
  - token booking happy path, a race on the same slot (only one succeeds), expired and invalid tokens, change and cancel inside and outside the 12-hour window
  - team booking
  - feedback permission (only the assigned interviewer, only after the start), independent visibility, immutability
  - offer creation rules, accept, decline and expiry, withdraw, mark hired
  - retention erases all new rows and the activity bump keeps active candidates
  - audit events contain no salary or notes
- e2e: the recruiter adds slots and moves a candidate to Interview, the candidate books from the Outbox link on a phone viewport, the interviewer submits feedback, the recruiter sends an offer, the candidate accepts, and the recruiter marks them hired.

## Out of scope

Panels and multi-interviewer slots, calendar sync (Google or Outlook APIs), SMS or WhatsApp reminders, automatic reminders (no scheduler beyond cron), e-signature providers, offer approval chains, negotiation or counter-offers, and analytics for offer acceptance rate.
