import { db } from "@/lib/db";
import { assertMocksAllowed } from "@/lib/providers";
import type { EmailProvider, OutgoingEmail } from "../types";

/** Stores emails in the Message table so they show up in the in-app Outbox. */
export class MockEmailProvider implements EmailProvider {
  async send(msg: OutgoingEmail): Promise<void> {
    assertMocksAllowed();
    await db.message.create({ data: msg });
  }
}
