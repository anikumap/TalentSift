import { randomBytes } from "node:crypto";
import { hmac } from "@/lib/crypto";
import { assertMocksAllowed } from "@/lib/providers";
import type { CheckoutItem } from "@/domain/constants";
import type { BillingProvider } from "../types";

const ITEMS: CheckoutItem[] = ["STARTER", "GROWTH", "JOB_CREDIT"];

function sign(payload: string): string {
  return hmac(`checkout:${payload}`).slice(0, 32);
}

/** Test-mode checkout: a signed session id and an internal "pay" page. */
export class MockBillingProvider implements BillingProvider {
  async createCheckout(orgId: string, item: CheckoutItem) {
    assertMocksAllowed();
    const payload = `${item}.${orgId}.${randomBytes(6).toString("hex")}`;
    const sessionId = `${payload}.${sign(payload)}`;
    return { sessionId, url: `/settings/billing/checkout?session=${encodeURIComponent(sessionId)}` };
  }

  async verify(orgId: string, sessionId: string): Promise<CheckoutItem> {
    assertMocksAllowed();
    const parts = sessionId.split(".");
    const [item, sessionOrg, nonce, signature] = parts;
    if (parts.length !== 4 || sign(`${item}.${sessionOrg}.${nonce}`) !== signature) {
      throw new Error("Invalid checkout session");
    }
    if (sessionOrg !== orgId || !ITEMS.includes(item as CheckoutItem)) throw new Error("Invalid checkout session");
    return item as CheckoutItem;
  }
}
