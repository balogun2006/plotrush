import { postgres } from "../lib/db/adapters";
import { PaystackClient, paystackConfig } from "../lib/providers/paystack";
import {
  processInbox,
  reconcilePayments,
  deliverReceipts,
} from "../lib/domain/payment-operations";
const config = paystackConfig();
if (!config) {
  console.log(
    JSON.stringify({
      event: "payment_worker_disabled",
      reason: "provider_not_configured",
    }),
  );
} else {
  if (!process.env.DATABASE_URL)
    throw Error("Payment worker requires PostgreSQL");
  const db = await postgres(process.env.DATABASE_URL);
  try {
    const provider = new PaystackClient(config),
      inbox = await processInbox(db, provider),
      reconciliation = await reconcilePayments(db, provider);
    let receipts: { claimed: number; sent: number } | { disabled: true } = {
      disabled: true,
    };
    if (
      process.env.FEATURE_PAYMENT_RECEIPTS === "true" &&
      /^re_[A-Za-z0-9_-]{16,}$/.test(process.env.RESEND_API_KEY ?? "") &&
      process.env.EMAIL_FROM
    ) {
      receipts = await deliverReceipts(db, async (r) => {
        const amount = new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: r.currency,
        }).format(r.amountMinor / 100);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": "receipt/" + r.id,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [r.to],
            subject:
              r.environment === "test"
                ? "PlotRush sandbox payment confirmation"
                : "PlotRush payment confirmation",
            text: `${r.environment === "test" ? "TEST PAYMENT — no live charge.\n" : ""}Payment verified: ${amount}. Order: ${r.orderId}. View your purchase: ${new URL("/orders/" + r.orderId, config.appUrl)}. This confirmation is not a tax invoice.`,
          }),
        });
        if (!response.ok) throw Error("Receipt delivery unavailable");
      });
    }
    console.log(
      JSON.stringify({
        event: "payment_worker_completed",
        inbox,
        reconciliation,
        receipts,
      }),
    );
  } finally {
    await db.close();
  }
}
