import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { getJob } from "@/services/jobs";
import { listShortlist } from "@/services/applications";
import { PageHeader } from "@/components/ui";
import { JobNav } from "../JobNav";
import { Board } from "./Board";

export const metadata = { title: "Pipeline" };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const job = await getJob(actor, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const rows = await listShortlist(actor, id, {});
  return (
    <>
      <PageHeader title={job.title} description="Drag cards between stages, or use “Move to” on each card." />
      <JobNav jobId={job.id} active="board" applicants={job.applicants} />
      <Board
        jobId={job.id}
        canMove={can(actor.role, "stage.change")}
        cards={rows.map((r) => ({
          appId: r.appId,
          name: r.displayName,
          stage: r.stage,
          score: r.evalStatus === "DONE" ? r.totalScore : null,
          mustHavesMet: r.mustHavesMet,
        }))}
      />
    </>
  );
}
