import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { listOutbox } from "@/services/dashboard";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Outbox" };

const KIND: Record<string, string> = {
  CANDIDATE_INVITE: "Interview invite",
  CANDIDATE_REJECTION: "Rejection",
  INVITE_MEMBER: "Team invite",
};

export default async function OutboxPage() {
  const actor = await requireActor();
  if (!can(actor.role, "stage.change")) redirect("/dashboard");
  const messages = await listOutbox(actor);
  return (
    <>
      <PageHeader
        title="Outbox"
        description="Emails TalentSift has sent for you. In this test setup they are recorded here instead of being delivered."
      />
      {messages.length === 0 ? (
        <EmptyState title="No emails yet" body="Shortlisting or rejecting a candidate, or inviting a teammate, sends an email that appears here." />
      ) : (
        <ul className="panel divide-y divide-line">
          {messages.map((m) => (
            <li key={m.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{m.subject}</span>
                    <span className="block text-sm text-ink-3">
                      To {m.to} · {KIND[m.kind] ?? m.kind}
                    </span>
                  </span>
                  <span className="text-sm text-ink-3">{dateTime(m.createdAt)}</span>
                </summary>
                <pre className="whitespace-pre-wrap border-t border-line bg-paper px-4 py-4 font-sans text-sm text-ink-2">{m.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
