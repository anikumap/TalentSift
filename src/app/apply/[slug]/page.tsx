import type { Metadata } from "next";
import { getOpenJobBySlug } from "@/services/jobs";
import { payRange } from "@/lib/format";
import { Logo } from "@/components/shell/Logo";
import { ApplyFlow } from "./ApplyFlow";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getOpenJobBySlug((await params).slug);
  return { title: job ? `Apply: ${job.title} at ${job.orgName}` : "Job closed" };
}

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params;
  const job = await getOpenJobBySlug(slug);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-6">
      {!job ? (
        <div className="mt-16 text-center">
          <h1 className="text-2xl font-bold">This job is no longer accepting applications.</h1>
          <p className="mt-2 text-ink-2">The employer has closed it or the link is incorrect.</p>
        </div>
      ) : (
        <>
          <header className="mb-6">
            <p className="text-sm font-semibold text-primary">{job.orgName}</p>
            <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">{job.title}</h1>
            <p className="mt-1 text-ink-2">
              {job.location} · {payRange(job.payMin, job.payMax)}
            </p>
          </header>
          <ApplyFlow slug={slug} job={job} />
        </>
      )}
      <footer className="mt-12 flex items-center justify-center gap-2 text-sm text-ink-3">
        <Logo compact /> Applications powered by TalentSift
      </footer>
    </main>
  );
}
