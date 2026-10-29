export const ROLES = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  INTERVIEWER: "Interviewer",
};

export const PIPELINE = ["APPLIED", "SHORTLISTED", "INTERVIEW", "OFFER", "HIRED"] as const;
export const STAGES = [...PIPELINE, "REJECTED", "ON_HOLD"] as const;
export type Stage = (typeof STAGES)[number];
export const FINAL_STAGES: Stage[] = ["HIRED", "REJECTED"];

export const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  ON_HOLD: "On hold",
};

export const JOB_STATUS = ["DRAFT", "OPEN", "CLOSED"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const MUST_HAVE_KINDS = ["LICENSE", "AVAILABILITY", "PAY", "OTHER"] as const;
export type MustHaveKind = (typeof MUST_HAVE_KINDS)[number];

export const PLANS = ["TRIAL", "STARTER", "GROWTH"] as const;
export type Plan = (typeof PLANS)[number];
export type CheckoutItem = "STARTER" | "GROWTH" | "JOB_CREDIT";

export const PLAN_PRICES_PAISE: Record<CheckoutItem, number> = {
  STARTER: 99900,
  GROWTH: 299900,
  JOB_CREDIT: 39900,
};

export const PLAN_JOB_LIMIT: Record<Plan, number> = {
  TRIAL: 1,
  STARTER: 3,
  GROWTH: Infinity,
};

export const TRIAL_DAYS = 14;
export const PERIOD_DAYS = 30;
export const GST_RATE = 0.18;

export const REJECT_REASONS = [
  "Does not meet must-have",
  "Lower skill evidence than other candidates",
  "Position filled",
  "Candidate withdrew",
  "Other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const AUDIT_ACTIONS = [
  "SCORECARD_UPDATED",
  "JOB_PUBLISHED",
  "JOB_CLOSED",
  "APPLICATION_SUBMITTED",
  "EVALUATION_CREATED",
  "STAGE_CHANGED",
  "IDENTITY_REVEALED",
  "MEMBER_INVITED",
  "PLAN_CHANGED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
