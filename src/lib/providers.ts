import { MockAIProvider } from "@/providers/ai/mock";
import { MockBillingProvider } from "@/providers/billing/mock";
import { MockEmailProvider } from "@/providers/email/mock";
import type { AIProvider, BillingProvider, EmailProvider } from "@/providers/types";

type Providers = { ai: AIProvider; email: EmailProvider; billing: BillingProvider };

const defaults = (): Providers => ({
  ai: new MockAIProvider(),
  email: new MockEmailProvider(),
  billing: new MockBillingProvider(),
});

let current: Providers = defaults();

export function getProviders(): Providers {
  return current;
}

/** Swap providers (tests, or when real Claude/Resend/Razorpay providers are added). */
export function setProviders(partial: Partial<Providers>): void {
  current = { ...current, ...partial };
}

export function resetProviders(): void {
  current = defaults();
}
