import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { IntakeChat } from "./IntakeChat";

export const metadata = { title: "Create a job" };

export default async function NewJobPage() {
  const actor = await requireActor();
  if (!can(actor.role, "job.edit")) redirect("/jobs");
  return (
    <>
      <PageHeader
        title="Create a job"
        description="Answer six short questions. The scorecard on the right fills in as you go, and you can edit everything afterwards."
      />
      <IntakeChat />
    </>
  );
}
