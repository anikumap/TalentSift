import { requireActor } from "@/lib/session";
import { date } from "@/lib/format";
import { previewExpired } from "@/services/retention";
import { PageHeader } from "@/components/ui";
import { RetentionForm, RunNowForm } from "./RetentionForm";

export const metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const actor = await requireActor();
  const preview = await previewExpired(actor);
  const nothing = preview.candidates === 0 && preview.messages === 0;

  return (
    <>
      <PageHeader
        title="Privacy"
        description={`Candidate data is kept for ${preview.retentionDays} days after their last activity, then erased for good.`}
      />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="period-h" className="space-y-6">
          <div>
            <h2 id="period-h" className="mb-3 text-base font-semibold">Retention period</h2>
            <div className="panel p-4">
              <RetentionForm days={preview.retentionDays} />
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-base font-semibold">What gets erased</h2>
            <ul className="panel list-disc space-y-1 py-3 pl-9 pr-4 text-sm text-ink-2">
              <li>Name, email, phone and city, answers, resume and evidence quotes for candidates with no activity in the period.</li>
              <li>Emails sent to those candidates from the Outbox.</li>
            </ul>
            <p className="mt-2 text-sm text-ink-3">
              Kept: the audit log (it records IDs, stages and scores, never names or answers), jobs, scorecards and your team. A
              daily job erases expired data automatically; changes to the period apply from its next run.
            </p>
          </div>
        </section>
        <section aria-labelledby="next-h">
          <h2 id="next-h" className="mb-3 text-base font-semibold">Next run</h2>
          <div className="panel space-y-3 p-4">
            {nothing ? (
              <p className="text-sm text-ink-2">Nothing is old enough to erase yet.</p>
            ) : (
              <>
                <p className="text-sm text-ink-2">
                  {preview.candidates} candidates ({preview.applications} applications) and {preview.messages} emails from before{" "}
                  {date(preview.cutoff)} will be erased.
                </p>
                <RunNowForm />
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
