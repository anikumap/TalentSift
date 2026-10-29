import Link from "next/link";
import { Logo } from "@/components/shell/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label="TalentSift home">
        <Logo />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
