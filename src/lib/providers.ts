import { RuleBasedAIProvider } from "@/providers/ai/rule-based";
import { MockBillingProvider } from "@/providers/billing/mock";
import { MockEmailProvider } from "@/providers/email/mock";
import type { AIProvider, BillingProvider, EmailProvider } from "@/providers/types";

type Providers = { ai: AIProvider; email: EmailProvider; billing: BillingProvider };

const defaults = (): Providers => ({
  ai: new RuleBasedAIProvider(),
  email: new MockEmailProvider(),
  billing: new MockBillingProvider(),
});

let current: Providers = defaults();

export function getProviders(): Providers {
  return current;
}

/**
 * The mock billing and email providers hand out free plan upgrades and never deliver email,
 * so a production server must opt in explicitly (demos, e2e) until real providers are wired up.
 */
export function assertMocksAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PROVIDERS !== "true") {
    throw new Error("Mock billing/email providers are disabled in production. Set ALLOW_MOCK_PROVIDERS=true for a demo deployment.");
  }
}

/** Swap providers (tests, or when real Claude/Resend/Razorpay providers are added). */
export function setProviders(partial: Partial<Providers>): void {
  current = { ...current, ...partial };
}

export function resetProviders(): void {
  current = defaults();
}
