import Link from "next/link";
import { getInvite } from "@/services/auth";
import { acceptInviteAction } from "@/app/actions/auth";
import { ROLE_LABELS } from "@/domain/constants";
import { Logo } from "@/components/shell/Logo";
import { AuthForm } from "@/app/(auth)/AuthForm";

export const metadata = { title: "Accept invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token);
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label="TalentSift home">
        <Logo />
      </Link>
      <div className="w-full max-w-sm">
        {!invite ? (
          <div className="panel p-6">
            <h1 className="text-lg font-bold">This invite link has expired</h1>
            <p className="mt-2 text-ink-2">Invite links work for 7 days and only once. Ask your admin to send a new one.</p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold">Join {invite.orgName}</h1>
            <p className="mb-6 mt-1 text-ink-2">
              You&apos;re joining as {ROLE_LABELS[invite.role]} with {invite.email}.
            </p>
            <div className="panel p-6">
              <AuthForm
                action={acceptInviteAction.bind(null, token)}
                submit="Join team"
                pending="Joining…"
                fields={[
                  { name: "name", label: "Your name", autoComplete: "name" },
                  { name: "password", label: "Choose a password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
