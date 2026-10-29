"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { confirmCheckout, startCheckout } from "@/services/billing";
import type { CheckoutItem } from "@/domain/constants";

export async function startCheckoutAction(item: CheckoutItem): Promise<void> {
  const actor = await requireActor();
  const { url } = await startCheckout(actor, item);
  redirect(url);
}

export async function confirmCheckoutAction(sessionId: string, _: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const result = await runAction(async () => {
    await confirmCheckout(actor, sessionId);
    revalidatePath("/settings/billing");
  });
  if (result?.ok) redirect("/settings/billing?paid=1");
  return result;
}
