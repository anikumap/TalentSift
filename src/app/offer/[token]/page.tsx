import type { Metadata } from "next";
import { getOfferPage, type OfferLetter } from "@/services/offers";
import { formatINR } from "@/domain/billing";
import { istDate } from "@/domain/interviews";
import { Logo } from "@/components/shell/Logo";
import { Notice } from "@/components/ui";
import { OfferResponse, PrintButton } from "./OfferResponse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your offer", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Letter({ l }: { l: OfferLetter }) {
  const rows: [string, string][] = [
    ["Role", l.jobTitle],
    ["Where", l.location],
    ["Shifts", l.shifts],
    ["Pay", `${formatINR(l.monthlyPay * 100)} a month`],
    ["Start date", istDate(l.startDate)],
    ["Please reply by", istDate(l.respondBy)],
  ];
  return (
    <article className="panel p-5 print:border-0 print:p-0" aria-labelledby="letter-h">
      <p className="text-sm font-semibold text-primary">{l.orgName}</p>
      <h1 id="letter-h" className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">Offer of employment</h1>
      <p className="mt-4">Dear {l.candidateName},</p>
      <p className="mt-2 text-ink-2">
        We&apos;re pleased to offer you the role of <span className="font-semibold text-ink">{l.jobTitle}</span> at {l.orgName}, on the terms below.
      </p>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5 text-sm">
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {l.terms && (
        <section className="mt-4" aria-labelledby="terms-h">
          <h2 id="terms-h" className="text-sm font-semibold">Other terms</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{l.terms}</p>
        </section>
      )}
      {l.status === "ACCEPTED" && l.signedName && (
        <p className="mt-5 text-sm">
          Accepted by <span className="font-semibold">{l.signedName}</span>.
        </p>
      )}
    </article>
  );
}

const ANSWERED: Record<string, { title: string; body: string; tone: "ok" | "primary" | "attention" }> = {
  ACCEPTED: { title: "You've accepted this offer", body: "This offer has already been answered. The team will be in touch about your first day.", tone: "ok" },
  DECLINED: { title: "You've declined this offer", body: "This offer has already been answered. Thank you for letting us know.", tone: "primary" },
  WITHDRAWN: { title: "This offer was withdrawn", body: "The employer withdrew this offer. Please check your email for their message.", tone: "attention" },
};

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getOfferPage(token);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-6 print:max-w-none print:p-0">
      {page.state === "invalid" ? (
        <div className="mt-16 text-center">
          <h1 className="text-2xl font-bold">This link doesn&apos;t work</h1>
          <p className="mt-2 text-ink-2">Please reply to the email you got from the employer and they&apos;ll help.</p>
        </div>
      ) : page.state === "closed" ? (
        <div className="mt-16 text-center">
          <p className="text-sm font-semibold text-primary">{page.letter.orgName}</p>
          <h1 className="mt-1 text-2xl font-bold">This position is no longer open</h1>
          <p className="mt-2 text-ink-2">Check your email for the latest from {page.letter.orgName}.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {page.state === "answered" && (
            <Notice tone={ANSWERED[page.letter.status].tone}>
              <p className="font-semibold">{ANSWERED[page.letter.status].title}</p>
              <p className="mt-0.5">{ANSWERED[page.letter.status].body}</p>
            </Notice>
          )}
          {page.state === "expired" && (
            <Notice tone="attention">
              <p className="font-semibold">This offer has expired</p>
              <p className="mt-0.5">The reply date has passed. If you&apos;re still interested, please reply to the employer&apos;s email.</p>
            </Notice>
          )}
          <Letter l={page.letter} />
          {page.state === "open" ? <OfferResponse token={token} candidateName={page.letter.candidateName} /> : <PrintButton />}
        </div>
      )}
      <footer className="mt-12 flex items-center justify-center gap-2 text-sm text-ink-3 print:hidden">
        <Logo compact /> Sent with TalentSift
      </footer>
    </main>
  );
}
