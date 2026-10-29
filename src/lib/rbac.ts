import type { Role } from "@/domain/constants";
import { AppError } from "./errors";

export type Actor = { id: string; orgId: string; role: Role; name: string };
export type Action = "job.edit" | "job.publish" | "candidate.view" | "stage.change" | "org.admin";

const PERMISSIONS: Record<Action, Role[]> = {
  "job.edit": ["ADMIN", "RECRUITER", "HIRING_MANAGER"],
  "job.publish": ["ADMIN", "RECRUITER"],
  "candidate.view": ["ADMIN", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"],
  "stage.change": ["ADMIN", "RECRUITER", "HIRING_MANAGER"],
  "org.admin": ["ADMIN"],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor.role, action)) throw new AppError("FORBIDDEN", "You don't have access to do that.");
}
