"use server";

import { revalidatePath } from "next/cache";
import { runAction, str, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { purgeExpired, setRetentionDays } from "@/services/retention";

export async function saveRetentionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const raw = str(form, "days").trim();
    const days = raw === "" ? NaN : Number(raw);
    await setRetentionDays(actor, days);
    revalidatePath("/settings/privacy");
    return { ok: true, message: `Saved. Data older than ${days} days will be erased on the next run.` };
  });
}

export async function runRetentionAction(_: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const [r] = await purgeExpired(new Date(), actor.orgId, actor);
    revalidatePath("/settings/privacy");
    return {
      ok: true,
      message: r ? `Erased ${r.candidates} candidates, ${r.applications} applications and ${r.messages} emails.` : "Nothing was old enough to erase.",
    };
  });
}
