"use client";

import { useActionState } from "react";
import { confirmCheckoutAction } from "@/app/actions/billing";
import { FormError } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ConfirmPayment({ sessionId, total }: { sessionId: string; total: string }) {
  const [state, action] = useActionState(confirmCheckoutAction.bind(null, sessionId), null);
  return (
    <form action={action} className="mt-5 space-y-3">
      <FormError message={state?.error} />
      <SubmitButton className="btn-primary w-full h-11" pendingText="Processing…">
        Pay {total} (test)
      </SubmitButton>
    </form>
  );
}
