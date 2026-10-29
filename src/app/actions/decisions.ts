"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { changeStage } from "@/services/decisions";
import { retryEvaluation } from "@/services/applications";
import type { RejectReason, Stage } from "@/domain/constants";

export async function changeStageAction(
  appId: string,
  jobId: string,
  toStage: Stage,
  reason?: { code: RejectReason; note?: string },
): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await changeStage(actor, appId, toStage, reason);
    revalidatePath(`/jobs/${jobId}/candidates`);
    revalidatePath(`/jobs/${jobId}/board`);
    revalidatePath(`/candidates/${appId}`);
    revalidatePath("/candidates");
  });
}

export async function retryEvaluationAction(appId: string, jobId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await retryEvaluation(actor, appId);
    revalidatePath(`/jobs/${jobId}/candidates`);
    revalidatePath(`/candidates/${appId}`);
  });
}
