import type { Metadata } from "next";
import { getBookingPage } from "@/services/interviews";
import { Logo } from "@/components/shell/Logo";
import { BookingFlow } from "./BookingFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book your interview", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getBookingPage(token);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-6">
      {page.state === "invalid" ? (
        <div className="mt-16 text-center">
          <h1 className="text-2xl font-bold">This link has expired</h1>
          <p className="mt-2 text-ink-2">Booking links work for 14 days. Please reply to the email you got from the employer and they&apos;ll send a new one.</p>
        </div>
      ) : page.state === "closed" ? (
        <div className="mt-16 text-center">
          <p className="text-sm font-semibold text-primary">{page.orgName}</p>
          <h1 className="mt-1 text-2xl font-bold">Booking is closed</h1>
          <p className="mt-2 text-ink-2">Interview booking for the {page.jobTitle} role is no longer open on this link. Check your email for the latest from {page.orgName}.</p>
        </div>
      ) : (
        <>
          <header className="mb-6">
            <p className="text-sm font-semibold text-primary">{page.orgName}</p>
            <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">Interview for {page.jobTitle}</h1>
          </header>
          <BookingFlow
            token={token}
            slots={page.slots.map((s) => ({ ...s, startsAt: s.startsAt.toISOString() }))}
            booked={page.state === "booked" ? { ...page.interview, startsAt: page.interview.startsAt.toISOString() } : null}
          />
        </>
      )}
      <footer className="mt-12 flex items-center justify-center gap-2 text-sm text-ink-3">
        <Logo compact /> Scheduling by TalentSift
      </footer>
    </main>
  );
}
