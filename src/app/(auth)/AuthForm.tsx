"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action";
import { FormError } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Field = { name: string; label: string; type?: string; autoComplete?: string; hint?: string; defaultValue?: string };

export function AuthForm({
  action,
  fields,
  submit,
  pending,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  fields: Field[];
  submit: string;
  pending: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={f.defaultValue}
            className="field"
            aria-invalid={!!state?.fields?.[f.name]}
            aria-describedby={f.hint ? `${f.name}-hint` : undefined}
            required
          />
          {f.hint && (
            <p id={`${f.name}-hint`} className="hint mt-1">
              {f.hint}
            </p>
          )}
          {state?.fields?.[f.name] && <p className="error-text">{state.fields[f.name]}</p>}
        </div>
      ))}
      <SubmitButton className="btn-primary w-full h-10" pendingText={pending}>
        {submit}
      </SubmitButton>
    </form>
  );
}
