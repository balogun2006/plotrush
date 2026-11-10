import type { Database } from "../db/types";
import { financeRevenueQuery } from "../contracts/refunds";
import { assert } from "./errors";
import { requireFinance, type FinanceContext } from "./refunds";
import { audit } from "./staff";

export async function exportFinanceRevenue(
  db: Database,
  ctx: FinanceContext,
  range: { from: string | null; to: string | null },
) {
  return db.transaction(async (tx) => {
    await requireFinance(tx, ctx);
    const dates = financeRevenueQuery.safeParse(range);
    assert(
      dates.success,
      400,
      "REPORT_RANGE_INVALID",
      "Choose a UTC date range of 1 to 31 days.",
    );
    const { from, to } = dates.data;
    const { rows } = await tx.query<{
      currency: string;
      mode: string;
      gross: string;
      refunded: string;
      net: string;
    }>(
      `WITH bounds AS (
         SELECT $1::date::timestamp AT TIME ZONE 'UTC' AS starts_at,
                ($2::date + 1)::timestamp AT TIME ZONE 'UTC' AS ends_at
       ), activity AS (
         SELECT o.product_id,o.currency,o.amount_minor AS gross,0::bigint AS refunded
         FROM app_private.orders o CROSS JOIN bounds b
         WHERE o.status='paid' AND o.environment='test'
           AND o.paid_at>=b.starts_at AND o.paid_at<b.ends_at
           AND EXISTS(SELECT 1 FROM app_private.payment_attempts p
                      WHERE p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded')
         UNION ALL
         SELECT o.product_id,o.currency,0::bigint,r.amount_minor::bigint
         FROM app_private.refunds r JOIN app_private.orders o ON o.id=r.order_id CROSS JOIN bounds b
         WHERE o.status='paid' AND o.environment='test'
           AND r.recorded_at>=b.starts_at AND r.recorded_at<b.ends_at
           AND EXISTS(SELECT 1 FROM app_private.payment_attempts p
                      WHERE p.order_id=o.id AND p.provider='paystack' AND p.status='succeeded')
       )
       SELECT a.currency,p.mode,sum(a.gross)::text AS gross,sum(a.refunded)::text AS refunded,
              (sum(a.gross)-sum(a.refunded))::text AS net
       FROM activity a JOIN app_private.products p ON p.id=a.product_id
       GROUP BY a.currency,p.mode ORDER BY a.currency,p.mode`,
      [from, to],
    );
    await audit(tx, ctx.actor, "finance.revenue_exported", "paystack_test", {
      from,
      to,
    });
    const lines = [
      "environment,from_utc,to_utc,currency,play_mode,gross_minor,confirmed_refund_minor,net_before_fees_minor",
    ];
    for (const { currency, mode, gross, refunded, net } of rows) {
      assert(
        /^[A-Z]{3}$/.test(currency),
        503,
        "REPORT_CURRENCY_INVALID",
        "The report contains an invalid currency.",
      );
      lines.push(
        ["test", from, to, currency, mode, gross, refunded, net].join(","),
      );
    }
    return {
      csv: lines.join("\r\n") + "\r\n",
      filename: `plotrush-test-revenue-${from}-${to}.csv`,
    };
  });
}
