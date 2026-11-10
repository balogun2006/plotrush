import { randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import type { FinanceOrder } from "../contracts/refunds";
import type { VerifiedRefund } from "../providers/paystack";
import { AppError, assert } from "./errors";
import { lockPrincipal } from "./identity";
import { audit, requireStaff } from "./staff";

export type FinanceContext = {
  actor: string;
  playerToken: string;
  staffToken?: string;
};
export const requireFinance = (db: Sql, ctx: FinanceContext) =>
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
  await requireFinance(db, ctx);
  return (
    await db.query<FinanceOrder>(
      `SELECT o.id,p.reference,o.product_id AS "productId",o.amount_minor::integer AS "amountMinor",o.currency,
              rr.reason,rr.id AS "requestId",(rr.id IS NOT NULL) AS "refundRequested",
              COALESCE(d.records,'[]'::jsonb) AS disputes,
              COALESCE((SELECT sum(amount_minor) FROM app_private.refunds WHERE order_id=o.id),0)::integer AS "refundedMinor"
       FROM app_private.orders o
       JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
       LEFT JOIN app_private.refund_requests rr ON rr.order_id=o.id AND rr.closed_at IS NULL
       LEFT JOIN LATERAL (
         SELECT bool_or(holds_access) AS held,
           jsonb_agg(jsonb_build_object('providerId',provider_id,'status',provider_status,'resolution',resolution,
             'refundMinor',refund_minor,'holdsAccess',holds_access,'updatedAt',to_char(timezone('UTC',provider_updated_at),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
             ORDER BY provider_updated_at DESC,provider_id) AS records
         FROM app_private.payment_disputes WHERE order_id=o.id
       ) d ON true
       WHERE o.status='paid' AND o.environment='test'
         AND (CASE WHEN $1='' THEN rr.id IS NOT NULL OR d.held ELSE o.id::text=$1 OR p.reference=$1 END)
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
  await requireFinance(db, ctx);
  const refund = await provider.fetchRefund(providerId);
  assert(
    refund.id === providerId,
    409,
    "REFUND_MISMATCH",
    "The Paystack refund does not match this order.",
  );
  return db.transaction(async (tx) => {
    await requireFinance(tx, ctx);
    const { refundedMinor } = await recordRefunds(
      tx,
      orderId,
      [refund],
      ctx.actor,
    );
    return { status: refund.status, refundedMinor };
  });
}

async function recordRefunds(
  tx: Sql,
  orderId: string,
  refunds: VerifiedRefund[],
  staffActor?: string,
) {
  const { rows } = await tx.query<{
    amount: number;
    currency: string;
    transaction_id: string;
    buyer_id: string;
  }>(
    `SELECT o.amount_minor::integer AS amount,o.currency,o.buyer_id,p.transaction_id
     FROM app_private.orders o
     JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded'
     WHERE o.id=$1 AND o.status='paid' AND o.environment='test'
     FOR UPDATE OF o`,
    [orderId],
  );
  const order = rows[0];
  assert(order, 404, "NOT_FOUND", "A paid Paystack test order is required.");
  let refundedMinor = await refundedTotal(tx, orderId);
  let recorded = 0;

  for (const refund of refunds) {
    assert(
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
    const existing = (
      await tx.query<{ order_id: string; amount_minor: number }>(
        "SELECT order_id,amount_minor FROM app_private.refunds WHERE provider_id=$1",
        [refund.id],
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
      continue;
    }
    if (refund.status !== "processed") continue;

    refundedMinor += refund.amountMinor;
    assert(
      refundedMinor <= order.amount,
      409,
      "REFUND_TOTAL_EXCEEDED",
      "Confirmed refunds cannot exceed the original payment.",
    );
    await tx.query(
      "INSERT INTO app_private.refunds(provider_id,order_id,amount_minor) VALUES($1,$2,$3)",
      [refund.id, orderId, refund.amountMinor],
    );
    recorded++;
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
    await audit(
      tx,
      staffActor ?? order.buyer_id,
      staffActor ? "refund.reconciled" : "refund.auto_reconciled",
      orderId,
      {
        providerId: refund.id,
        amountMinor: refund.amountMinor,
        currency: order.currency,
        refundedMinor,
        full,
      },
    );
  }
  return { refundedMinor, recorded };
}

export async function recoverRequestedRefunds(
  db: Database,
  provider: {
    config: { environment: "test" | "live" };
    listRefunds(
      transactionId: string,
      currency: string,
    ): Promise<VerifiedRefund[]>;
  },
) {
  const summary = { checked: 0, recorded: 0, mismatches: 0, unavailable: 0 };
  if (provider.config.environment !== "test") return summary;
  const requests = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      order_id: string;
      transaction_id: string;
      currency: string;
    }>(
      `SELECT rr.id,o.id AS order_id,p.transaction_id,o.currency
       FROM app_private.refund_requests rr
       JOIN app_private.orders o ON o.id=rr.order_id AND o.status='paid' AND o.environment='test'
       JOIN app_private.payment_attempts p ON p.order_id=o.id AND p.provider='paystack'
        AND p.status='succeeded' AND p.transaction_id IS NOT NULL
       WHERE rr.closed_at IS NULL AND rr.next_reconcile_at<=now()
       ORDER BY rr.next_reconcile_at,rr.id LIMIT 5 FOR UPDATE OF rr SKIP LOCKED`,
    );
    for (const request of rows)
      await tx.query(
        "UPDATE app_private.refund_requests SET next_reconcile_at=now()+interval '5 minutes' WHERE id=$1",
        [request.id],
      );
    return rows;
  });
  summary.checked = requests.length;
  for (const request of requests) {
    let refunds: VerifiedRefund[];
    try {
      refunds = await provider.listRefunds(
        request.transaction_id,
        request.currency,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "REFUND_LIST_LIMIT")
        summary.mismatches++;
      else summary.unavailable++;
      continue;
    }
    try {
      const processed = refunds.filter(
        (refund) => refund.status === "processed",
      );
      if (processed.length) {
        const result = await db.transaction((tx) =>
          recordRefunds(tx, request.order_id, processed),
        );
        summary.recorded += result.recorded;
      }
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        !["REFUND_MISMATCH", "REFUND_TOTAL_EXCEEDED"].includes(error.code)
      )
        throw error;
      summary.mismatches++;
    }
  }
  return summary;
}

export async function closeRefundRequest(
  db: Database,
  ctx: FinanceContext,
  orderId: string,
  requestId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    await requireFinance(tx, ctx);
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
