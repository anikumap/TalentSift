import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { ScoreMeter } from "@/components/ui";
import { CHECKOUT_ITEMS } from "@/services/billing";
import { formatINR } from "@/domain/billing";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Start free trial
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 md:px-8">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink md:text-[3.4rem]">
              Hire caregivers, packers and cashiers on what they can actually do.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
              Describe the role in five minutes. Applicants answer three real situations from the job on their phone. You get a
              ranked shortlist with the sentences that earned each score — names hidden until you choose to meet someone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary btn-lg">
                Post your first job free
              </Link>
              <Link href="/login" className="btn-secondary btn-lg">
                Log in
              </Link>
            </div>
          </div>

          <figure className="panel p-5 shadow-[0_1px_0_var(--line)]" aria-label="Example of a scored candidate">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">Candidate #A7F2</p>
              <p className="tnum text-2xl font-bold">
                82<span className="text-sm font-medium text-ink-3">/100</span>
              </p>
            </div>
            <p className="mt-1 text-sm text-ink-3">Home Caregiver · Pune</p>
            <dl className="mt-5 space-y-4">
              {[
                ["Patient care & dignity", 4, "I sit with her, speak softly and explain why the tablet matters before trying again."],
                ["Medication & routines", 3, "I note the refusal in the chart and tell the nurse on duty by 9 pm."],
                ["Handling emergencies", 3, "I don't move him, I call 108 and keep him warm and talking."],
              ].map(([skill, score, quote]) => (
                <div key={skill as string}>
                  <dt className="flex items-center justify-between gap-3 text-sm font-semibold">
                    {skill}
                    <ScoreMeter score={score as number} label={skill as string} />
                  </dt>
                  <dd className="mt-1 text-sm text-ink-2">
                    “<span className="evidence">{quote}</span>”
                  </dd>
                </div>
              ))}
            </dl>
          </figure>
        </section>

        <section className="border-t border-line py-14" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-bold tracking-tight">
            How it works
          </h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[
              ["Describe the role", "Answer six questions. TalentSift drafts a scorecard of 4–6 weighted skills and the must-haves, like a licence or night shifts."],
              ["Share one link", "Applicants apply in about two minutes on their phone — no account, resume optional, in plain language."],
              ["Decide on evidence", "See who showed the skills, with their own words as proof. You make every advance or reject decision, and each one is logged."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-14" aria-labelledby="pricing">
          <h2 id="pricing" className="text-2xl font-bold tracking-tight">
            Pricing in rupees
          </h2>
          <p className="mt-1 text-ink-2">Start with a 14-day free trial for one job. Prices exclude 18% GST.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {CHECKOUT_ITEMS.map((p) => (
              <div key={p.key} className="panel p-5">
                <p className="font-semibold">{p.name}</p>
                <p className="tnum mt-2 text-3xl font-bold">
                  {formatINR(p.pricePaise)}
                  <span className="text-sm font-medium text-ink-3">{p.key === "JOB_CREDIT" ? " one-off" : " / month"}</span>
                </p>
                <p className="mt-2 text-sm font-semibold text-primary">{p.jobs}</p>
                <p className="mt-1 text-sm text-ink-2">{p.blurb}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-3 md:px-8">
          A person makes every hiring decision. AI scores are evidence, never a verdict.
        </p>
      </footer>
    </div>
  );
}
