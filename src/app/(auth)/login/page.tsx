import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { loginAction } from "@/app/actions/auth";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getActor()) redirect("/dashboard");
  return (
    <>
      <h1 className="mb-6 text-xl font-bold">Log in to TalentSift</h1>
      <div className="panel p-6">
        <AuthForm
          action={loginAction}
          submit="Log in"
          pending="Logging in…"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
        />
      </div>
      <p className="mt-4 text-sm text-ink-2">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-primary underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
