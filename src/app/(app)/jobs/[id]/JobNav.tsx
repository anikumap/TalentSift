import Link from "next/link";
import { cx } from "@/components/ui";

const TABS = [
  { key: "overview", label: "Setup", href: (id: string) => `/jobs/${id}` },
  { key: "candidates", label: "Shortlist", href: (id: string) => `/jobs/${id}/candidates` },
  { key: "board", label: "Pipeline", href: (id: string) => `/jobs/${id}/board` },
  { key: "interviews", label: "Interviews", href: (id: string) => `/jobs/${id}/interviews` },
] as const;

export function JobNav({ jobId, active, applicants }: { jobId: string; active: (typeof TABS)[number]["key"]; applicants: number }) {
  return (
    <nav aria-label="Job sections" className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(jobId)}
          aria-current={active === t.key ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
            active === t.key ? "border-primary text-primary" : "border-transparent text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
          {(t.key === "candidates" || t.key === "board") && <span className="tnum ml-1.5 font-normal text-ink-3">{applicants}</span>}
        </Link>
      ))}
    </nav>
  );
}
