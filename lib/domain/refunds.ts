import { randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import type { FinanceOrder } from "../contracts/refunds";
import type { VerifiedRefund } from "../providers/paystack";
import { assert } from "./errors";
import { lockPrincipal } from "./identity";
import { audit, requireStaff } from "./staff";

type FinanceContext = {
  actor: string;
  playerToken: string;
  staffToken?: string;
};
const finance = (db: Sql, ctx: FinanceContext) =>
  requireStaff(db, ctx.actor, ctx.playerToken, ctx.staffToken, "finance");

export async function requestRefund(
  db: Database,
  actor: string,
  orderId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const { rows } = await tx.query<{ amount: number }>(
      `SELECT o.amount_minor::integer AS amount
       FROM app_private.orders o
       JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
       WHERE o.id=$1 AND o.buyer_id=$2 AND o.status='paid' AND o.environment='test'
       FOR UPDATE OF o`,
      [orderId, actor],
    );
    assert(
      rows[0],
      404,
      "NOT_FOUND",
      "A paid Paystack test order is required.",
    );
    // Check again after acquiring the order lock. A reconciliation may have committed while waiting.
    const total = await refundedTotal(tx, orderId);
    assert(
      total < rows[0].amount,
      409,
      "ORDER_REFUNDED",
      "This order is already fully refunded.",
    );
    const inserted = await tx.query(
      `INSERT INTO app_private.refund_requests(id,order_id,reason) VALUES($1,$2,$3)
       ON CONFLICT(order_id) WHERE closed_at IS NULL DO NOTHING RETURNING id`,
      [randomUUID(), orderId, reason],
    );
    if (inserted.rows.length)
      await audit(tx, actor, "refund.requested", orderId);
    return { refundRequested: true };
  });
}

async function refundedTotal(db: Sql, orderId: string) {
  const { rows } = await db.query<{ total: number }>(
    "SELECT COALESCE(sum(amount_minor),0)::integer AS total FROM app_private.refunds WHERE order_id=$1",
    [orderId],
  );
  return rows[0].total;
}

export async function financeOrders(
  db: Sql,
  ctx: FinanceContext,
  search: string,
) {
  await finance(db, ctx);
  return (
    await db.query<FinanceOrder>(
      `SELECT o.id,p.reference,o.product_id AS "productId",o.amount_minor::integer AS "amountMinor",o.currency,
              rr.reason,rr.id AS "requestId",(rr.id IS NOT NULL) AS "refundRequested",
              COALESCE((SELECT sum(amount_minor) FROM app_private.refunds WHERE order_id=o.id),0)::integer AS "refundedMinor"
       FROM app_private.orders o
       JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
       LEFT JOIN app_private.refund_requests rr ON rr.order_id=o.id AND rr.closed_at IS NULL
       WHERE o.status='paid' AND o.environment='test'
         AND (CASE WHEN $1='' THEN rr.id IS NOT NULL ELSE o.id::text=$1 OR p.reference=$1 END)
       ORDER BY rr.created_at DESC NULLS LAST,o.paid_at DESC LIMIT 50`,
      [search],
    )
  ).rows;
}

export async function reconcileRefund(
  db: Database,
  ctx: FinanceContext,
  orderId: string,
  providerId: string,
  provider: { fetchRefund(id: string): Promise<VerifiedRefund> },
) {
  await finance(db, ctx);
  const refund = await provider.fetchRefund(providerId);
  return db.transaction(async (tx) => {
    await finance(tx, ctx);
    const { rows } = await tx.query<{
      amount: number;
      currency: string;
      transaction_id: string;
    }>(
      `SELECT o.amount_minor::integer AS amount,o.currency,p.transaction_id
       FROM app_private.orders o
       JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
       WHERE o.id=$1 AND o.status='paid' AND o.environment='test'
       FOR UPDATE OF o`,
      [orderId],
    );
    const order = rows[0];
    assert(order, 404, "NOT_FOUND", "A paid Paystack test order is required.");
    assert(
      refund.id === providerId &&
        refund.environment === "test" &&
        refund.transactionId === order.transaction_id &&
        refund.currency === order.currency &&
        Number.isSafeInteger(refund.amountMinor) &&
        refund.amountMinor > 0 &&
        refund.amountMinor <= order.amount,
      409,
      "REFUND_MISMATCH",
      "The Paystack refund does not match this order.",
    );
    const total = await refundedTotal(tx, orderId);
    const existing = (
      await tx.query<{ order_id: string; amount_minor: number }>(
        "SELECT order_id,amount_minor FROM app_private.refunds WHERE provider_id=$1",
        [providerId],
      )
    ).rows[0];
    if (existing) {
      assert(
        existing.order_id === orderId &&
          existing.amount_minor === refund.amountMinor &&
          refund.status === "processed",
        409,
        "REFUND_MISMATCH",
        "Paystack returned a different record for an already recorded refund.",
      );
      return { status: refund.status, refundedMinor: total };
    }
    if (refund.status !== "processed")
      return { status: refund.status, refundedMinor: total };

    const refundedMinor = total + refund.amountMinor;
    assert(
      refundedMinor <= order.amount,
      409,
      "REFUND_TOTAL_EXCEEDED",
      "Confirmed refunds cannot exceed the original payment.",
    );
    await tx.query(
      "INSERT INTO app_private.refunds(provider_id,order_id,amount_minor) VALUES($1,$2,$3)",
      [providerId, orderId, refund.amountMinor],
    );
    const full = refundedMinor === order.amount;
    if (full) {
      await tx.query(
        "UPDATE app_private.entitlements SET state='revoked' WHERE origin_order_id=$1",
        [orderId],
      );
      await tx.query(
        "UPDATE app_private.refund_requests SET closed_at=now() WHERE order_id=$1 AND closed_at IS NULL",
        [orderId],
      );
    }
    await audit(tx, ctx.actor, "refund.reconciled", orderId, {
      providerId,
      amountMinor: refund.amountMinor,
      currency: order.currency,
      refundedMinor,
      full,
    });
    return { status: refund.status, refundedMinor };
  });
}

export async function closeRefundRequest(
  db: Database,
  ctx: FinanceContext,
  orderId: string,
  requestId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    await finance(tx, ctx);
    await tx.query("SELECT id FROM app_private.orders WHERE id=$1 FOR UPDATE", [
      orderId,
    ]);
    const closed = await tx.query(
      "UPDATE app_private.refund_requests SET closed_at=now() WHERE order_id=$1 AND id=$2 AND closed_at IS NULL RETURNING id",
      [orderId, requestId],
    );
    assert(
      closed.rows.length,
      404,
      "NOT_FOUND",
      "No open refund request for this order.",
    );
    await audit(tx, ctx.actor, "refund.request_closed", orderId, {
      reason,
      requestId,
    });
    return { closed: true };
  });
}
