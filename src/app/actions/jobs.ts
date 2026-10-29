"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import {
  closeJob,
  createJobFromIntake,
  previewScorecard,
  publishJob,
  regenerateAd,
  updateJobDetails,
  updateScorecard,
} from "@/services/jobs";
import type { IntakeAnswers, ScorecardDraft } from "@/providers/types";

export async function previewScorecardAction(answers: Partial<IntakeAnswers>): Promise<ScorecardDraft> {
  await requireActor();
  return previewScorecard(answers);
}

export async function createJobAction(answers: IntakeAnswers): Promise<ActionState> {
  const actor = await requireActor();
  let id = "";
  const result = await runAction(async () => {
    id = await createJobFromIntake(actor, answers);
  });
  if (result?.ok) redirect(`/jobs/${id}`);
  return result;
}

type ScorecardInput = Parameters<typeof updateScorecard>[2];
type DetailsInput = Parameters<typeof updateJobDetails>[2];

export async function saveScorecardAction(jobId: string, input: ScorecardInput): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateScorecard(actor, jobId, input);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, message: "Scorecard saved." };
  });
}

export async function saveDetailsAction(jobId: string, input: DetailsInput): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateJobDetails(actor, jobId, input);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, message: "Saved." };
  });
}

export async function regenerateAdAction(jobId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await regenerateAd(actor, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, message: "Job ad rewritten from the scorecard." };
  });
}

export async function publishJobAction(jobId: string, _: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await publishJob(actor, jobId);
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");
    return { ok: true, message: "Published. The apply link is live." };
  });
}

export async function closeJobAction(jobId: string, _: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await closeJob(actor, jobId);
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");
    return { ok: true, message: "Closed. The apply link no longer accepts applications." };
  });
}
