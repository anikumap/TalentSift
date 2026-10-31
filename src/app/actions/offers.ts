"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction, str, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { allow, clientIp } from "@/lib/rateLimit";
import { createOffer, markHired, respondToOffer, withdrawOffer } from "@/services/offers";

const refresh = (appId: string) => {
  revalidatePath(`/candidates/${appId}`);
  revalidatePath("/dashboard");
};

export async function createOfferAction(appId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const pay = str(form, "monthlyPay").replace(/[,\s₹]/g, "");
    await createOffer(actor, appId, {
      monthlyPay: pay === "" ? Number.NaN : Number(pay),
      startDate: str(form, "startDate"),
      respondBy: str(form, "respondBy"),
      terms: str(form, "terms"),
    });
    refresh(appId);
    return { ok: true, message: "Offer sent. The email is in the Outbox." };
  });
}

export async function withdrawOfferAction(appId: string, offerId: string, reason: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await withdrawOffer(actor, offerId, reason);
    refresh(appId);
  });
}

export async function markHiredAction(appId: string): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    await markHired(actor, appId);
    refresh(appId);
  });
}

// ---------- Candidate-facing (no session; the token is the credential) ----------

export async function respondToOfferAction(token: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    if (!allow(`offer:${clientIp(await headers())}`, 20, 60 * 60_000)) {
      throw new AppError("LIMIT", "Too many tries from this connection. Please wait a while and try again.");
    }
    if (str(form, "decision") === "accept") {
      if (form.get("confirm") !== "on") throw new AppError("VALIDATION", "Tick the box to confirm you accept.", { confirm: "Required" });
      await respondToOffer(token, { accept: true, signedName: str(form, "signedName") });
    } else {
      await respondToOffer(token, { accept: false, reason: str(form, "reason") });
    }
    revalidatePath(`/offer/${token}`);
  });
}
