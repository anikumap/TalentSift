import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ROLE_LABELS } from "@/domain/constants";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/shell/Logo";
import { Nav, type NavItem } from "@/components/shell/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.orgId } });

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/jobs", label: "Jobs" },
    { href: "/candidates", label: "Candidates" },
    ...(can(actor.role, "stage.change") ? [{ href: "/outbox", label: "Outbox" }] : []),
    ...(can(actor.role, "org.admin")
      ? [
          { href: "/settings/team", label: "Team" },
          { href: "/settings/billing", label: "Billing" },
          { href: "/settings/audit", label: "Audit log" },
        ]
      : []),
  ];

  return (
    <div className="md:grid md:min-h-screen md:grid-cols-[232px_1fr]">
      <aside className="relative flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-b-0 md:border-r md:py-5">
        <Link href="/dashboard" aria-label="Dashboard" className="md:px-3">
          <Logo />
        </Link>
        <Nav items={items} />
        <div className="hidden md:mt-auto md:block md:px-3">
          <p className="truncate text-sm font-semibold text-ink">{org.name}</p>
          <p className="truncate text-sm text-ink-3">
            {actor.name} · {ROLE_LABELS[actor.role]}
          </p>
          <form action={logoutAction} className="mt-3">
            <button type="submit" className="text-sm font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
