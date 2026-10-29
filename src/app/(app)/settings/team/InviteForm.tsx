"use client";

import { useActionState } from "react";
import { inviteAction } from "@/app/actions/auth";
import { ROLES, ROLE_LABELS } from "@/domain/constants";
import { FormError, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, null);
  return (
    <form action={action} className="space-y-3" key={state?.ok ? state.message : "form"}>
      <div>
        <label htmlFor="invite-email" className="label">Email</label>
        <input id="invite-email" name="email" type="email" className="field" required />
        {state?.fields?.email && <p className="error-text">{state.fields.email}</p>}
      </div>
      <div>
        <label htmlFor="invite-role" className="label">Role</label>
        <select id="invite-role" name="role" className="field" defaultValue="RECRUITER">
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <FormError message={state?.error} />
      {state?.ok && <Notice tone="ok">{state.message}</Notice>}
      <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
    </form>
  );
}
