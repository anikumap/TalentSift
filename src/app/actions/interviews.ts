"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction, str, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { allow, clientIp } from "@/lib/rateLimit";
import {
  addSlots,
  bookByToken,
  bookForCandidate,
  cancelByToken,
  cancelInterview,
  deleteSlot,
  resendBookingLink,
  setInterviewStatus,
} from "@/services/interviews";
import { submitFeedback } from "@/services/feedback";
import type { Recommendation } from "@/domain/constants";

const refreshApp = (appId: string) => {
  revalidatePath(`/candidates/${appId}`);
  revalidatePath("/interviews");
};

export async function addSlotsAction(jobId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const count = await addSlots(actor, jobId, {
      date: str(form, "date"),
      from: str(form, "from"),
      to: str(form, "to"),
      lengthMin: str(form, "lengthMin"),
      interviewerId: str(form, "interviewerId"),
      mode: str(form, "mode") as "IN_PERSON",
      location: str(form, "location"),
    });
    revalidatePath(`/jobs/${jobId}/interviews`);
    return { ok: true, message: `Added ${count} interview ${count === 1 ? "time" : "times"}.` };
  });
}

export async function deleteSlotAction(jobId: string, slotId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteSlot(actor, slotId);
    revalidatePath(`/jobs/${jobId}/interviews`);
  });
}

export async function bookForCandidateAction(appId: string, slotId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    if (!slotId) throw new AppError("VALIDATION", "Choose a time.");
    await bookForCandidate(actor, appId, slotId);
    refreshApp(appId);
  });
}

export async function cancelInterviewAction(appId: string, interviewId: string, reason: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await cancelInterview(actor, interviewId, reason);
    refreshApp(appId);
  });
}

export async function setInterviewStatusAction(appId: string, interviewId: string, status: "COMPLETED" | "NO_SHOW"): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await setInterviewStatus(actor, interviewId, status);
    refreshApp(appId);
  });
}

export async function resendBookingLinkAction(appId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await resendBookingLink(actor, appId);
    refreshApp(appId);
    return { ok: true, message: "Booking link sent. It's in the Outbox." };
  });
}

// ---------- Candidate-facing (no session; the token is the credential) ----------

async function limitPublic(): Promise<void> {
  if (!allow(`book:${clientIp(await headers())}`, 20, 60 * 60_000)) {
    throw new AppError("LIMIT", "Too many tries from this connection. Please wait a while and try again.");
  }
}

export async function bookByTokenAction(token: string, slotId: string): Promise<ActionState> {
  return runAction(async () => {
    await limitPublic();
    if (!slotId) throw new AppError("VALIDATION", "Choose a time first.");
    await bookByToken(token, slotId);
    revalidatePath(`/book/${token}`);
  });
}

export async function cancelByTokenAction(token: string): Promise<ActionState> {
  return runAction(async () => {
    await limitPublic();
    await cancelByToken(token);
    revalidatePath(`/book/${token}`);
  });
}

export async function submitFeedbackAction(appId: string, interviewId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const ratings: Record<string, number> = {};
    for (const [k, v] of form.entries()) {
      if (k.startsWith("rating_") && typeof v === "string" && v !== "") ratings[k.slice(7)] = Number(v);
    }
    await submitFeedback(actor, interviewId, {
      ratings,
      recommendation: str(form, "recommendation") as Recommendation,
      notes: str(form, "notes"),
    });
    refreshApp(appId);
    return { ok: true, message: "Your feedback is in." };
  });
}
