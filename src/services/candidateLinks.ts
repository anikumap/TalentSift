import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type LinkPurpose = "BOOKING" | "OFFER";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates (or replaces) the candidate's link for `purpose` and returns the raw token. Only the hash is stored. */
export async function issueLink(tx: Prisma.TransactionClient, applicationId: string, purpose: LinkPurpose, expiresAt: Date): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = sha256(token);
  await tx.candidateLink.upsert({
    where: { applicationId_purpose: { applicationId, purpose } },
    create: { applicationId, purpose, tokenHash, expiresAt },
    update: { tokenHash, expiresAt, createdAt: new Date() },
  });
  return token;
}

/** The application a live token belongs to, or null if it's unknown, for another purpose, or expired. */
export async function resolveLink(token: string, purpose: LinkPurpose, now = new Date()): Promise<{ applicationId: string } | null> {
  if (!token || token.length > 100) return null;
  const link = await db.candidateLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!link || link.purpose !== purpose || link.expiresAt <= now) return null;
  return { applicationId: link.applicationId };
}

export const linkUrl = (path: "book" | "offer", token: string) => `${process.env.APP_URL ?? ""}/${path}/${token}`;
