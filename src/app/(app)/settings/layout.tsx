import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!can(actor.role, "org.admin")) redirect("/dashboard");
  return <>{children}</>;
}
