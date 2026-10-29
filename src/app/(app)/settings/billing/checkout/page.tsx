import Link from "next/link";
import { requireActor } from "@/lib/session";
import { getProviders } from "@/lib/providers";
import { CHECKOUT_ITEMS } from "@/services/billing";
import { formatINR, gstBreakdown } from "@/domain/billing";
import { PageHeader } from "@/components/ui";
import { ConfirmPayment } from "./ConfirmPayment";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const actor = await requireActor();
  const { session = "" } = await searchParams;
  const item = await getProviders().billing.verify(actor.orgId, session).catch(() => null);
  const product = CHECKOUT_ITEMS.find((p) => p.key === item);

  if (!product) {
    return (
      <>
        <PageHeader title="Checkout" />
        <div className="panel p-6">
          <p className="font-semibold">This checkout link isn&apos;t valid.</p>
          <Link href="/settings/billing" className="btn-secondary mt-4">Back to billing</Link>
        </div>
      </>
    );
  }

  const { subtotal, gst, total } = gstBreakdown(product.pricePaise);
  return (
    <div className="max-w-md">
      <PageHeader title="Checkout" description="Test mode: no money is charged. Razorpay can replace this screen later." />
      <section className="panel p-5" aria-label="Order summary">
        <p className="font-semibold">TalentSift {product.name}</p>
        <p className="text-sm text-ink-3">{product.jobs}</p>
        <dl className="tnum mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd>{formatINR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-2">GST (18%)</dt><dd>{formatINR(gst)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatINR(total)}</dd></div>
        </dl>
        <ConfirmPayment sessionId={session} total={formatINR(total)} />
      </section>
      <Link href="/settings/billing" className="mt-4 inline-block text-sm font-semibold text-ink-2 hover:text-ink">Cancel</Link>
    </div>
  );
}
