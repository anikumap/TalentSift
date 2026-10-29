import { requireActor } from "@/lib/session";
import { date } from "@/lib/format";
import { listMembers } from "@/services/auth";
import { ROLE_LABELS } from "@/domain/constants";
import { Badge, PageHeader } from "@/components/ui";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Team" };

const ROLE_HELP = [
  ["Admin", "Everything, including billing, team and the audit log."],
  ["Recruiter", "Create and publish jobs, review and decide on candidates."],
  ["Hiring manager", "Create jobs and decide on candidates. Can't publish."],
  ["Interviewer", "View shortlists and evidence. Can't change stages."],
];

export default async function TeamPage() {
  const actor = await requireActor();
  const { users, invites } = await listMembers(actor);
  return (
    <>
      <PageHeader title="Team" />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="members-h">
          <h2 id="members-h" className="mb-3 text-base font-semibold">Members</h2>
          <ul className="panel divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{u.name}{u.id === actor.id && <span className="font-normal text-ink-3"> (you)</span>}</span>
                  <span className="block truncate text-sm text-ink-3">{u.email}</span>
                </span>
                <Badge tone={u.role === "ADMIN" ? "primary" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-2">{i.email}</span>
                  <span className="block text-sm text-ink-3">Invited · expires {date(i.expiresAt)}</span>
                </span>
                <Badge tone="attention">{ROLE_LABELS[i.role]}</Badge>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="invite-h">
          <h2 id="invite-h" className="mb-3 text-base font-semibold">Invite someone</h2>
          <div className="panel p-4">
            <InviteForm />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            {ROLE_HELP.map(([role, help]) => (
              <div key={role}>
                <dt className="font-semibold">{role}</dt>
                <dd className="text-ink-2">{help}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
