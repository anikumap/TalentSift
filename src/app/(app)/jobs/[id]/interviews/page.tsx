import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { getJob } from "@/services/jobs";
import { listSlots, listTeam } from "@/services/interviews";
import { INTERVIEW_MODE_LABELS } from "@/domain/constants";
import { istDay, istDayKey, istTime } from "@/domain/interviews";
import { EmptyState, PageHeader } from "@/components/ui";
import { JobNav } from "../JobNav";
import { DeleteSlotButton, SlotForm } from "./SlotForm";

export const metadata = { title: "Interview times" };

export default async function InterviewSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const job = await getJob(actor, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const manage = can(actor.role, "interview.manage");
  const [slots, team] = await Promise.all([listSlots(actor, id), manage ? listTeam(actor) : Promise.resolve([])]);
  const now = Date.now();
  const days = new Map<string, typeof slots>();
  for (const s of slots) days.set(istDayKey(s.startsAt), [...(days.get(istDayKey(s.startsAt)) ?? []), s]);
  const open = slots.filter((s) => !s.booked && s.startsAt.getTime() > now).length;

  return (
    <>
      <PageHeader
        title={job.title}
        description="Times candidates can book. Moving someone to Interview emails them a link to pick one. All times are India time."
      />
      <JobNav jobId={job.id} active="interviews" applicants={job.applicants} />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="slots-h">
          <h2 id="slots-h" className="text-lg font-semibold">
            Interview times <span className="font-normal text-ink-3">· {open} open</span>
          </h2>
          {slots.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No interview times yet" body="Add a block of times. Candidates you move to Interview can then book one themselves." />
            </div>
          ) : (
            <div className="mt-3 space-y-5">
              {[...days.entries()].map(([key, list]) => (
                <div key={key}>
                  <h3 className="mb-2 text-sm font-semibold text-ink-2">{istDay(list[0].startsAt)}</h3>
                  <ul className="panel divide-y divide-line" aria-label={`Interview times on ${istDay(list[0].startsAt)}`}>
                    {list.map((s) => {
                      const past = s.startsAt.getTime() <= now;
                      return (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="tnum w-20 font-semibold">{istTime(s.startsAt)}</span>
                          <span className="flex-1 text-ink-2">
                            {INTERVIEW_MODE_LABELS[s.mode]} · {s.durationMin} min · {s.interviewerName}
                          </span>
                          {s.booked ? (
                            <Link href={`/candidates/${s.booked.appId}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                              {s.booked.displayName}
                            </Link>
                          ) : past ? (
                            <span className="text-ink-3">Not booked</span>
                          ) : manage ? (
                            <DeleteSlotButton jobId={job.id} slotId={s.id} />
                          ) : (
                            <span className="text-ink-3">Open</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
        {manage && (
          <aside className="panel h-fit p-4" aria-labelledby="add-h">
            <h2 id="add-h" className="font-semibold">Add interview times</h2>
            <SlotForm jobId={job.id} team={team} defaultDate={istDayKey(new Date(now + 86_400_000))} defaultLocation={job.location} />
          </aside>
        )}
      </div>
    </>
  );
}
