import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProviders } from "@/lib/providers";
import { email, name, parse, password } from "@/lib/validation";
import { ROLES, ROLE_LABELS, TRIAL_DAYS, type Role } from "@/domain/constants";
import { audit } from "./audit";

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const DAY = 86_400_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

function toActor(u: { id: string; orgId: string; role: string; name: string }): Actor {
  return { id: u.id, orgId: u.orgId, role: u.role as Role, name: u.name };
}

const signupSchema = z.object({
  orgName: z.string().trim().min(2, "Enter your organisation's name").max(120),
  name,
  email,
  password,
});

export async function signup(input: z.input<typeof signupSchema>): Promise<Actor> {
  const data = parse(signupSchema, input);
  if (await db.user.findUnique({ where: { email: data.email } })) {
    throw new AppError("CONFLICT", "An account with this email already exists.", { email: "Already registered" });
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: data.orgName } });
    await tx.subscription.create({
      data: { orgId: org.id, plan: "TRIAL", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY) },
    });
    return tx.user.create({
      data: { orgId: org.id, email: data.email, name: data.name, passwordHash, role: "ADMIN" },
    });
  });
  return toActor(user);
}

// Compared against when the email is unknown, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function login(emailInput: string, pw: string): Promise<Actor | null> {
  const user = await db.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
  const ok = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? toActor(user) : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) },
  });
  return token;
}

export async function getActorByToken(token: string): Promise<Actor | null> {
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date()) return null;
  return toActor(session.user);
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

const inviteSchema = z.object({ email, role: z.enum(ROLES) });

export async function inviteMember(actor: Actor, input: z.input<typeof inviteSchema>): Promise<string> {
  assertCan(actor, "org.admin");
  const data = parse(inviteSchema, input);
  if (await db.user.findUnique({ where: { email: data.email } })) {
    throw new AppError("CONFLICT", "That person already has an account.", { email: "Already registered" });
  }
  const token = newToken();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
  await db.$transaction(async (tx) => {
    const invite = await tx.invite.create({
      data: {
        orgId: actor.orgId,
        email: data.email,
        role: data.role,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
      },
    });
    await audit(tx, {
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.name,
      action: "MEMBER_INVITED",
      entityType: "Invite",
      entityId: invite.id,
      after: { email: data.email, role: data.role },
    });
  });
  const link = `${process.env.APP_URL ?? ""}/invite/${token}`;
  await getProviders().email.send({
    orgId: actor.orgId,
    to: data.email,
    kind: "INVITE_MEMBER",
    subject: `${actor.name} invited you to ${org.name} on TalentSift`,
    body: `Hi,\n\n${actor.name} invited you to join ${org.name} on TalentSift as ${ROLE_LABELS[data.role]}.\n\nAccept the invite (valid for ${INVITE_DAYS} days):\n${link}\n`,
  });
  return token;
}

export async function getInvite(token: string) {
  const invite = await db.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { org: true } });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) return null;
  return { email: invite.email, role: invite.role as Role, orgName: invite.org.name };
}

const acceptSchema = z.object({ name, password });

export async function acceptInvite(token: string, input: z.input<typeof acceptSchema>): Promise<Actor> {
  const data = parse(acceptSchema, input);
  const invite = await db.invite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new AppError("NOT_FOUND", "This invite link is invalid or has expired.");
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await db.$transaction(async (tx) => {
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return tx.user.create({
      data: { orgId: invite.orgId, email: invite.email, name: data.name, passwordHash, role: invite.role },
    });
  });
  return toActor(user);
}

export async function listMembers(actor: Actor) {
  assertCan(actor, "org.admin");
  const [users, invites] = await Promise.all([
    db.user.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "asc" } }),
    db.invite.findMany({
      where: { orgId: actor.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role as Role })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role as Role, expiresAt: i.expiresAt })),
  };
}
