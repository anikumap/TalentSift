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
  "RETENTION_CHANGED",
  "RETENTION_PURGE",
  "INTERVIEW_SLOTS_ADDED",
  "INTERVIEW_BOOKED",
  "INTERVIEW_CANCELLED",
  "INTERVIEW_STATUS_CHANGED",
  "FEEDBACK_SUBMITTED",
  "OFFER_SENT",
  "OFFER_RESPONDED",
  "OFFER_WITHDRAWN",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const INTERVIEW_MODES = ["IN_PERSON", "PHONE", "VIDEO"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = { IN_PERSON: "In person", PHONE: "Phone call", VIDEO: "Video call" };

export const INTERVIEW_STATUSES = ["SCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "Didn't attend",
};

export const RECOMMENDATIONS = ["STRONG_YES", "YES", "NO", "STRONG_NO"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = { STRONG_YES: "Strong yes", YES: "Yes", NO: "No", STRONG_NO: "Strong no" };

export const OFFER_STATUSES = ["SENT", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = { SENT: "Sent", ACCEPTED: "Accepted", DECLINED: "Declined", WITHDRAWN: "Withdrawn" };
