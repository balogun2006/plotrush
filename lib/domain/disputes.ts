import type { Database } from "../db/types";
import type { DisputeSummary } from "../contracts/disputes";
import type { VerifiedDispute } from "../providers/paystack";
import { assert } from "./errors";
import { audit } from "./staff";
import { requireFinance, type FinanceContext } from "./refunds";

export async function reconcileDispute(
  db: Database,
  ctx: FinanceContext,
  orderId: string,
  providerId: string,
  provider: { fetchDispute(id: string): Promise<VerifiedDispute> },
): Promise<DisputeSummary> {
  await requireFinance(db, ctx);
  const dispute = await provider.fetchDispute(providerId);
  return db.transaction(async (tx) => {
    await requireFinance(tx, ctx);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "dispute:" + providerId,
    ]);
    const {
      rows: [order],
    } = await tx.query<{
      amount: number;
      currency: string;
      transaction_id: string;
      reference: string;
    }>(
      `SELECT o.amount_minor::integer AS amount,o.currency,p.transaction_id,p.reference
       FROM app_private.orders o JOIN app_private.payment_attempts p
         ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
       WHERE o.id=$1 AND o.status='paid' AND o.environment='test'
       FOR UPDATE OF o`,
      [orderId],
    );
    assert(order, 404, "NOT_FOUND", "A paid Paystack test order is required.");
    const payment = dispute.transaction;
    assert(
      dispute.id === providerId &&
        dispute.domain === "test" &&
        payment.domain === "test" &&
        payment.id === order.transaction_id &&
        payment.reference === order.reference &&
        payment.currency === order.currency &&
        payment.amount === order.amount &&
        (dispute.currency === null || dispute.currency === order.currency) &&
        (dispute.refund_amount === null ||
          dispute.refund_amount <= order.amount),
      409,
      "DISPUTE_MISMATCH",
      "The Paystack dispute does not match this order.",
    );

    // A declined merchant response alone is insufficient. The provider also
    // needs to report the dispute resolved with no refund.
    const next: DisputeSummary = {
      providerId,
      status: dispute.status,
      resolution: dispute.resolution,
      refundMinor: dispute.refund_amount,
      holdsAccess: !(
        dispute.status === "resolved" &&
        dispute.resolution === "declined" &&
        !dispute.refund_amount
      ),
      updatedAt: new Date(dispute.updatedAt).toISOString(),
    };
    const {
      rows: [prior],
    } = await tx.query<DisputeSummary & { orderId: string }>(
      `SELECT order_id AS "orderId",provider_id AS "providerId",provider_status AS status,resolution,
              refund_minor AS "refundMinor",holds_access AS "holdsAccess",provider_updated_at AS "updatedAt"
       FROM app_private.payment_disputes WHERE provider_id=$1`,
      [providerId],
    );
    if (prior) {
      const { orderId: previousOrder, ...previous } = prior;
      assert(
        previousOrder === orderId,
        409,
        "DISPUTE_MISMATCH",
        "This dispute is linked to another order.",
      );
      const previousTime = new Date(previous.updatedAt).toISOString();
      if (next.updatedAt <= previousTime) {
        assert(
          next.updatedAt < previousTime ||
            (next.status === previous.status &&
              next.resolution === previous.resolution &&
              next.refundMinor === previous.refundMinor),
          409,
          "DISPUTE_CONFLICT",
          "Paystack returned conflicting versions of this dispute.",
        );
        return { ...previous, updatedAt: previousTime };
      }
    }
    await tx.query(
      `INSERT INTO app_private.payment_disputes(provider_id,order_id,provider_status,resolution,refund_minor,provider_updated_at,holds_access)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(provider_id) DO UPDATE SET provider_status=excluded.provider_status,resolution=excluded.resolution,
         refund_minor=excluded.refund_minor,provider_updated_at=excluded.provider_updated_at,holds_access=excluded.holds_access`,
      [
        providerId,
        orderId,
        next.status,
        next.resolution,
        next.refundMinor,
        next.updatedAt,
        next.holdsAccess,
      ],
    );
    // Keep dispute holds separate from refunds and other entitlement states.
    // Updating the entitlement row serializes with premium starts' share lock.
    await tx.query(
      `UPDATE app_private.entitlements SET dispute_hold=EXISTS(
        SELECT 1 FROM app_private.payment_disputes WHERE order_id=$1 AND holds_access
      ) WHERE origin_order_id=$1`,
      [orderId],
    );
    await audit(tx, ctx.actor, "dispute.reconciled", orderId, {
      ...next,
      previousStatus: prior?.status ?? null,
    });
    return next;
  });
}
