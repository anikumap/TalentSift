import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { dateTime } from "@/lib/format";
import { getApplicationDetail } from "@/services/applications";
import { Badge, Notice, ScoreMeter, StageBadge, TotalScore } from "@/components/ui";
import { DecisionButtons } from "@/components/candidates/DecisionButtons";
import { RetryButton } from "@/components/candidates/RetryButton";
import { InterviewsPanel } from "@/components/candidates/InterviewsPanel";
import { FeedbackPanel } from "@/components/candidates/FeedbackPanel";
import { listInterviewsForApp, listOpenSlots } from "@/services/interviews";
import { getFeedback } from "@/services/feedback";
import { OfferPanel } from "@/components/candidates/OfferPanel";
import { getOffersForApp } from "@/services/offers";
import { getJob } from "@/services/jobs";
import { istDayKey } from "@/domain/interviews";
import type { InterviewStatus } from "@/domain/constants";

export const metadata = { title: "Candidate" };

export default async function CandidatePage({ params }: { params: Promise<{ appId: string }> }) {
  const actor = await requireActor();
  const { appId } = await params;
  const app = await getApplicationDetail(actor, appId).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const manage = can(actor.role, "interview.manage");
  const atInterview = app.stage === "INTERVIEW";
  const [interviews, openSlots, feedback, offers, job] = await Promise.all([
    listInterviewsForApp(actor, app.appId),
    manage && atInterview ? listOpenSlots(actor, app.jobId) : Promise.resolve([]),
    getFeedback(actor, app.appId),
    getOffersForApp(actor, app.appId),
    manage ? getJob(actor, app.jobId) : Promise.resolve(null),
  ]);
  const showOffer = manage && job && (offers.length > 0 || app.stage === "INTERVIEW" || app.stage === "OFFER");
  const now = Date.now();
  const showFeedback = feedback.visible.length > 0 || feedback.hiddenCount > 0 || feedback.mineDue.length > 0;

  return (
    <>
      <Link href={`/jobs/${app.jobId}/candidates`} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
        {app.jobTitle} shortlist
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{app.displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <StageBadge stage={app.stage} /> Applied {dateTime(app.createdAt)} · Ref {app.publicRef}
          </p>
        </div>
        {app.evalStatus === "DONE" && <TotalScore value={app.totalScore} size="lg" />}
      </div>

      {can(actor.role, "stage.change") && (
        <div className="mt-4">
          <DecisionButtons appId={app.appId} jobId={app.jobId} stage={app.stage} offerPanel={manage} />
        </div>
      )}

      {app.injectionFlags.length > 0 && (
        <div className="mt-4">
          <Notice tone="attention">
            These answers contain text that looks like an attempt to influence an AI grader ({app.injectionFlags.join(", ")}). It was
            treated as plain text and didn&apos;t change the score. Read the answers yourself before deciding.
          </Notice>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="ev-h">
            <h2 id="ev-h" className="text-lg font-semibold">Evidence by skill</h2>
            <p className="mt-1 text-ink-2">{app.why}</p>
            {app.evalStatus === "FAILED" && <RetryButton appId={app.appId} jobId={app.jobId} />}
            <ul className="mt-4 space-y-4">
              {app.skills.map((s) => (
                <li key={s.skillId} className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{s.name}</span>
                    <span className="flex items-center gap-2 text-sm text-ink-3">
                      <span className="tnum">{s.weight}%</span>
                      <ScoreMeter score={s.score} label={s.name} />
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-ink-2">
                    {s.evidence.length === 0 ? (
                      <p className="text-ink-3">No evidence for this skill in the answers.</p>
                    ) : (
                      s.evidence.map((q, i) => (
                        <p key={i}>
                          “<span className="evidence">{q}</span>”
                        </p>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {app.model && (
              <p className="mt-3 text-xs text-ink-3">
                Scored by {app.model} (prompt {app.promptVersion}). Scores are evidence for a person to weigh, not a decision.
              </p>
            )}
          </section>

          {showFeedback && (
            <FeedbackPanel
              appId={app.appId}
              actorId={actor.id}
              skills={feedback.skills}
              graderScores={app.evalStatus === "DONE" ? Object.fromEntries(app.skills.map((s) => [s.skillId, s.score])) : {}}
              mineDue={interviews
                .filter((i) => feedback.mineDue.includes(i.interviewId))
                .map((i) => ({ interviewId: i.interviewId, startsAt: i.startsAt.toISOString() }))}
              visible={feedback.visible.map((v) => ({ ...v, startsAt: v.startsAt.toISOString() }))}
              hiddenCount={feedback.hiddenCount}
            />
          )}

          <section aria-labelledby="ans-h">
            <h2 id="ans-h" className="text-lg font-semibold">Answers</h2>
            <ol className="mt-3 space-y-4">
              {app.answers.map((a, i) => (
                <li key={i}>
                  <p className="font-semibold">{i + 1}. {a.question}</p>
                  <p className="mt-1 whitespace-pre-line text-ink-2">{a.answer || <span className="text-ink-3">No answer.</span>}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          {showOffer && (
            <OfferPanel
              appId={app.appId}
              stage={app.stage}
              offers={offers.map((o) => ({
                id: o.id,
                monthlyPay: o.monthlyPay,
                startDate: o.startDate.toISOString(),
                respondBy: o.respondBy.toISOString(),
                status: o.status,
                signedName: o.signedName,
                declineReason: o.declineReason,
                expired: o.expired,
              }))}
              payMin={job.payMin}
              payMax={job.payMax}
              today={istDayKey(new Date(now))}
              tomorrow={istDayKey(new Date(now + 86_400_000))}
              inAWeek={istDayKey(new Date(now + 7 * 86_400_000))}
            />
          )}
          {(interviews.length > 0 || atInterview) && (
            <InterviewsPanel
              appId={app.appId}
              atInterview={atInterview}
              manage={manage}
              interviews={interviews.map((i) => ({
                interviewId: i.interviewId,
                startsAt: i.startsAt.toISOString(),
                durationMin: i.durationMin,
                mode: i.mode,
                location: i.location,
                status: i.status as InterviewStatus,
                interviewerName: i.interviewerName,
              }))}
              openSlots={openSlots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), mode: s.mode }))}
            />
          )}
          <section className="panel p-4" aria-labelledby="contact-h">
            <h2 id="contact-h" className="font-semibold">Contact</h2>
            {app.contact ? (
              <dl className="mt-2 space-y-1 text-sm">
                <div><dt className="sr-only">Name</dt><dd className="font-semibold">{app.contact.name}</dd></div>
                <div><dt className="sr-only">Email</dt><dd><a className="text-primary underline-offset-2 hover:underline" href={`mailto:${app.contact.email}`}>{app.contact.email}</a></dd></div>
                <div><dt className="sr-only">Phone</dt><dd><a className="text-primary underline-offset-2 hover:underline" href={`tel:${app.contact.phone.replace(/\s/g, "")}`}>{app.contact.phone}</a></dd></div>
                <div><dt className="sr-only">City</dt><dd className="text-ink-2">{app.contact.city}</dd></div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-2">Hidden to keep the review fair. Shortlist this candidate to see their name and contact details.</p>
            )}
          </section>

          <section className="panel p-4" aria-labelledby="mh-h">
            <h2 id="mh-h" className="font-semibold">Must-haves</h2>
            {app.mustHaves.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">None for this job.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {app.mustHaves.map((m) => (
                  <li key={m.label} className="flex items-start justify-between gap-3">
                    <span>{m.label}</span>
                    {m.met ? <Badge tone="ok">Yes</Badge> : <Badge tone="attention">No</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-4" aria-labelledby="cv-h">
            <h2 id="cv-h" className="font-semibold">Resume</h2>
            {app.resume ? (
              <>
                {app.resumeParsed && (
                  <p className="mt-2 text-sm text-ink-2">
                    {app.resumeParsed.yearsExperience > 0 && <>{app.resumeParsed.yearsExperience} years experience. </>}
                    {app.resumeParsed.certifications.length > 0 && <>Certifications: {app.resumeParsed.certifications.join(", ")}.</>}
                  </p>
                )}
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line text-sm text-ink-3">{app.resume}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-3">No resume attached. That&apos;s fine — the answers carry the score.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
