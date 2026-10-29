import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { signupAction } from "@/app/actions/auth";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getActor()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-xl font-bold">Start your free trial</h1>
      <p className="mb-6 mt-1 text-ink-2">14 days, one open job, no card needed.</p>
      <div className="panel p-6">
        <AuthForm
          action={signupAction}
          submit="Create account"
          pending="Creating account…"
          fields={[
            { name: "orgName", label: "Organisation name", autoComplete: "organization" },
            { name: "name", label: "Your name", autoComplete: "name" },
            { name: "email", label: "Work email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
          ]}
        />
      </div>
      <p className="mt-4 text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
