import { formatINR } from "@/domain/billing";

export function payRange(min: number, max: number): string {
  return `${formatINR(min * 100)}–${formatINR(max * 100)}/month`;
}

export function dateTime(d: Date): string {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function date(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(d: Date, now = Date.now()): string {
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const ACTION_TEXT: Record<string, string> = {
  SCORECARD_UPDATED: "updated a scorecard",
  JOB_PUBLISHED: "published a job",
  JOB_CLOSED: "closed a job",
  APPLICATION_SUBMITTED: "A candidate applied",
  EVALUATION_CREATED: "An application was scored",
  STAGE_CHANGED: "moved a candidate",
  IDENTITY_REVEALED: "revealed a candidate's identity",
  MEMBER_INVITED: "invited a team member",
  PLAN_CHANGED: "changed the plan",
  INTERVIEW_SLOTS_ADDED: "added interview times",
  INTERVIEW_BOOKED: "booked an interview",
  INTERVIEW_CANCELLED: "cancelled an interview",
  INTERVIEW_STATUS_CHANGED: "closed an interview",
  FEEDBACK_SUBMITTED: "submitted interview feedback",
  OFFER_SENT: "sent an offer",
  OFFER_RESPONDED: "answered an offer",
  OFFER_WITHDRAWN: "withdrew an offer",
};

export function describeAudit(e: { action: string; actorName: string | null; before: string | null; after: string | null }): string {
  const text = ACTION_TEXT[e.action] ?? e.action;
  if (!e.actorName) return text;
  if (e.action === "STAGE_CHANGED" && e.before && e.after) {
    const from = (JSON.parse(e.before) as { stage: string }).stage;
    const to = (JSON.parse(e.after) as { stage: string }).stage;
    return `${e.actorName} moved a candidate from ${from.toLowerCase().replace("_", " ")} to ${to.toLowerCase().replace("_", " ")}`;
  }
  return `${e.actorName} ${text}`;
}
