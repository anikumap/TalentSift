import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  signup,
  login,
  createSession,
  getActorByToken,
  destroySession,
  inviteMember,
  acceptInvite,
} from "@/services/auth";
import { resetDb } from "../setup/db";

const owner = { orgName: "Sunrise Care", name: "Asha Rao", email: "asha@sunrise.test", password: "secret123" };

describe("auth service", () => {
  beforeEach(resetDb);

  it("signup creates an org, an admin and a 14-day trial", async () => {
    const actor = await signup(owner);
    expect(actor.role).toBe("ADMIN");
    const sub = await db.subscription.findUnique({ where: { orgId: actor.orgId } });
    expect(sub?.plan).toBe("TRIAL");
    const days = (sub!.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it("logs in with the right password only", async () => {
    await signup(owner);
    expect((await login("ASHA@sunrise.test", "secret123"))?.name).toBe("Asha Rao");
    expect(await login("asha@sunrise.test", "wrong")).toBeNull();
    expect(await login("nobody@x.test", "secret123")).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    await signup(owner);
    await expect(signup({ ...owner, orgName: "Other" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("validates signup input", async () => {
    await expect(signup({ ...owner, password: "short" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(signup({ ...owner, email: "not-an-email" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("resolves a session token to the actor, and not after logout", async () => {
    const actor = await signup(owner);
    const token = await createSession(actor.id);
    expect((await getActorByToken(token))?.id).toBe(actor.id);
    await destroySession(token);
    expect(await getActorByToken(token)).toBeNull();
  });

  it("ignores expired sessions", async () => {
    const actor = await signup(owner);
    const token = await createSession(actor.id);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getActorByToken(token)).toBeNull();
  });

  it("only admins can invite, and invites create users with the chosen role", async () => {
    const admin = await signup(owner);
    const inviteToken = await inviteMember(admin, { email: "ravi@sunrise.test", role: "RECRUITER" });

    const message = await db.message.findFirst({ where: { to: "ravi@sunrise.test" } });
    expect(message?.body).toContain(`/invite/${inviteToken}`);
    expect(await db.auditEvent.count({ where: { action: "MEMBER_INVITED" } })).toBe(1);

    const ravi = await acceptInvite(inviteToken, { name: "Ravi K", password: "password1" });
    expect(ravi).toMatchObject({ role: "RECRUITER", orgId: admin.orgId });

    await expect(inviteMember(ravi, { email: "x@sunrise.test", role: "ADMIN" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(acceptInvite(inviteToken, { name: "Again", password: "password1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
