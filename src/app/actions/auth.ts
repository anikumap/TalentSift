"use server";

import { redirect } from "next/navigation";
import { runAction, str, type ActionState } from "@/lib/action";
import { allow, clear, clientIp } from "@/lib/rateLimit";
import { headers } from "next/headers";
import { requireActor, setSessionCookie, clearSessionCookie } from "@/lib/session";
import { acceptInvite, createSession, destroySession, inviteMember, login, signup } from "@/services/auth";
import type { Role } from "@/domain/constants";
import { revalidatePath } from "next/cache";

export async function signupAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!allow(`signup:${clientIp(await headers())}`, 10,60 * 60_000)) {
    return { error: "Too many sign-ups from this connection. Please try again in an hour." };
  }
  const result = await runAction(async () => {
    const actor = await signup({
      orgName: str(form, "orgName"),
      name: str(form, "name"),
      email: str(form, "email"),
      password: str(form, "password"),
    });
    await setSessionCookie(await createSession(actor.id));
  });
  if (result?.ok) redirect("/dashboard");
  return result;
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const limitKey = `login:${str(form, "email").trim().toLowerCase()}`;
  if (!allow(limitKey, 10, 15 * 60_000)) {
    return { error: "Too many attempts for this account. Please wait 15 minutes and try again." };
  }
  const actor = await login(str(form, "email"), str(form, "password"));
  if (!actor) return { error: "That email and password don't match an account." };
  clear(limitKey);
  await setSessionCookie(await createSession(actor.id));
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const token = await clearSessionCookie();
  if (token) await destroySession(token);
  redirect("/login");
}

export async function acceptInviteAction(token: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const actor = await acceptInvite(token, { name: str(form, "name"), password: str(form, "password") });
    await setSessionCookie(await createSession(actor.id));
  });
  if (result?.ok) redirect("/dashboard");
  return result;
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return runAction(async () => {
    const email = str(form, "email");
    await inviteMember(actor, { email, role: str(form, "role") as Role });
    revalidatePath("/settings/team");
    return { ok: true, message: `Invite sent to ${email}. You can see it in the Outbox.` };
  });
}
