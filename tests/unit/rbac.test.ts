import { describe, it, expect } from "vitest";
import { can, assertCan } from "@/lib/rbac";
import { AppError } from "@/lib/errors";

describe("rbac", () => {
  it("matches the permission table", () => {
    expect(can("ADMIN", "org.admin")).toBe(true);
    expect(can("RECRUITER", "org.admin")).toBe(false);
    expect(can("RECRUITER", "job.publish")).toBe(true);
    expect(can("HIRING_MANAGER", "job.publish")).toBe(false);
    expect(can("HIRING_MANAGER", "job.edit")).toBe(true);
    expect(can("HIRING_MANAGER", "stage.change")).toBe(true);
    expect(can("INTERVIEWER", "stage.change")).toBe(false);
    expect(can("INTERVIEWER", "job.edit")).toBe(false);
    expect(can("INTERVIEWER", "candidate.view")).toBe(true);
  });

  it("limits the fairness monitor to admins and recruiters", () => {
    expect(can("ADMIN", "fairness.view")).toBe(true);
    expect(can("RECRUITER", "fairness.view")).toBe(true);
    expect(can("HIRING_MANAGER", "fairness.view")).toBe(false);
    expect(can("INTERVIEWER", "fairness.view")).toBe(false);
  });

  it("throws a FORBIDDEN AppError when not allowed", () => {
    const actor = { id: "u", orgId: "o", role: "INTERVIEWER" as const, name: "I" };
    try {
      assertCan(actor, "stage.change");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("FORBIDDEN");
    }
  });
});
