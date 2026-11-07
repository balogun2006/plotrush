import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "../db/types";
import { assert } from "./errors";
import { account } from "./accounts";
import { lockPrincipal } from "./identity";
export type CommerceEnvironment = "development" | "test" | "live";
import { orderInput } from "../contracts/account-commerce";
export { orderInput } from "../contracts/account-commerce";
export async function products(db: Sql, development = false, sandbox = false) {
  return (
    await db.query<{
      id: string;
      caseId: string;
      mode: "solo" | "group";
      priceVersionId: string;
      amountMinor: number;
      currency: string;
    }>(
      `SELECT p.id,p.case_key AS "caseId",p.mode,v.id AS "priceVersionId",v.amount_minor::integer AS "amountMinor",v.currency FROM app_private.products p JOIN app_private.price_versions v ON v.product_id=p.id WHERE ($1 OR (p.active AND v.active) OR ($2 AND p.id IN ('wedding-gift-solo','wedding-gift-group') AND v.id IN ('demo-wedding-solo-ngn-v1','demo-wedding-group-ngn-v1'))) ORDER BY p.id`,
      [development, sandbox],
    )
  ).rows;
}
export async function createOrder(
  db: Database,
  actor: string,
  input: z.infer<typeof orderInput>,
  environment: CommerceEnvironment,
  development = false,
  sandbox = false,
) {
  input = orderInput.parse(input);
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await tx.query(
      "SELECT id FROM app_private.principals WHERE id=$1 FOR UPDATE",
      [actor],
    );
    assert(
      (await account(tx, actor)).kind === "verified",
      403,
      "VERIFIED_EMAIL_REQUIRED",
      "Verify your email before buying a case.",
    );
    const prior = (
      await tx.query<{
        id: string;
        product_id: string;
        price_version_id: string;
        environment: string;
      }>(
        "SELECT id,product_id,price_version_id,environment FROM app_private.orders WHERE buyer_id=$1 AND idempotency_key=$2",
        [actor, input.idempotencyKey],
      )
    ).rows[0];
    if (prior) {
      assert(
        prior.product_id === input.productId &&
          prior.price_version_id === input.priceVersionId &&
          prior.environment === environment,
        409,
        "IDEMPOTENCY_CONFLICT",
        "This order key was used for a different request.",
      );
      return readOrder(tx, actor, prior.id);
    }
    assert(
      !(
        await tx.query(
          "SELECT 1 FROM app_private.entitlements WHERE owner_id=$1 AND product_id=$2 AND state='active'",
          [actor, input.productId],
        )
      ).rows.length,
      409,
      "ALREADY_OWNED",
      "You already own this case in this mode.",
    );
    const price = (
      await tx.query<{ amount_minor: string; currency: string }>(
        "SELECT v.amount_minor,v.currency FROM app_private.price_versions v JOIN app_private.products p ON p.id=v.product_id WHERE v.id=$1 AND p.id=$2 AND ($3 OR (v.active AND p.active) OR ($4 AND p.id IN ('wedding-gift-solo','wedding-gift-group') AND v.id IN ('demo-wedding-solo-ngn-v1','demo-wedding-group-ngn-v1'))) FOR SHARE OF p,v",
        [
          input.priceVersionId,
          input.productId,
          development && environment === "development",
          sandbox && environment === "test",
        ],
      )
    ).rows[0];
    assert(
      price,
      404,
      "PRODUCT_UNAVAILABLE",
      "This product or quote is unavailable.",
    );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO app_private.orders(id,buyer_id,product_id,price_version_id,amount_minor,currency,environment,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        actor,
        input.productId,
        input.priceVersionId,
        price.amount_minor,
        price.currency,
        environment,
        input.idempotencyKey,
      ],
    );
    return readOrder(tx, actor, id);
  });
}
export async function readOrder(db: Sql, actor: string, id: string) {
  const r = (
    await db.query<{
      id: string;
      productId: string;
      mode: "solo" | "group";
      amountMinor: number;
      currency: string;
      status: string;
      environment: CommerceEnvironment;
      expiresAt: string;
      paidAt: string | null;
    }>(
      `SELECT o.id,o.product_id AS "productId",p.mode,o.amount_minor::integer AS "amountMinor",o.currency,CASE WHEN o.status='pending' AND o.expires_at<=now() THEN 'expired' ELSE o.status END AS status,o.environment,o.expires_at AS "expiresAt",o.paid_at AS "paidAt" FROM app_private.orders o JOIN app_private.products p ON p.id=o.product_id WHERE o.id=$1 AND o.buyer_id=$2`,
      [id, actor],
    )
  ).rows[0];
  assert(r, 404, "NOT_FOUND", "Order unavailable.");
  return r;
}
export async function preparePayment(
  db: Database,
  actor: string,
  id: string,
  provider: string,
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await tx.query("SELECT id FROM app_private.orders WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    const order = await readOrder(tx, actor, id);
    assert(
      order.status === "pending",
      422,
      "CHECKOUT_CLOSED",
      "This checkout is closed. Create a fresh order if the quote expired.",
    );
    const ref = "plotrush-" + randomUUID().replaceAll("-", "");
    await tx.query(
      "INSERT INTO app_private.payment_attempts(id,order_id,provider,reference) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,provider) DO NOTHING",
      [randomUUID(), id, provider, ref],
    );
    return {
      order,
      ...(
        await tx.query<{ reference: string }>(
          "SELECT reference FROM app_private.payment_attempts WHERE order_id=$1 AND provider=$2",
          [id, provider],
        )
      ).rows[0],
    };
  });
}
export type VerifiedPayment = {
  reference: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  environment: CommerceEnvironment;
  success: boolean;
};
// Called only after a server-side provider verification. Browser success flags
// never reach this function. Tests cover duplicates, mismatch and late success.
export async function fulfilPayment(db: Database, payment: VerifiedPayment) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "payment:" + payment.transactionId,
    ]);
    const attempt = (
      await tx.query<{
        id: string;
        order_id: string;
        status: string;
        transaction_id: string | null;
      }>("SELECT * FROM app_private.payment_attempts WHERE reference=$1", [
        payment.reference,
      ])
    ).rows[0];
    assert(attempt, 404, "REFERENCE_UNKNOWN", "Payment reference unavailable.");
    const order = (
      await tx.query<{
        buyer_id: string;
        product_id: string;
        amount_minor: string;
        currency: string;
        environment: string;
      }>("SELECT * FROM app_private.orders WHERE id=$1 FOR UPDATE", [
        attempt.order_id,
      ])
    ).rows[0];
    await tx.query(
      "SELECT id FROM app_private.payment_attempts WHERE id=$1 FOR UPDATE",
      [attempt.id],
    );
    // Re-read after the order lock; another verifier may have fulfilled it.
    Object.assign(
      attempt,
      (
        await tx.query(
          "SELECT status,transaction_id FROM app_private.payment_attempts WHERE id=$1",
          [attempt.id],
        )
      ).rows[0],
    );
    assert(
      payment.success &&
        Number.isSafeInteger(payment.amountMinor) &&
        payment.amountMinor === Number(order.amount_minor) &&
        payment.currency === order.currency &&
        payment.environment === order.environment &&
        payment.transactionId.length > 0,
      409,
      "PAYMENT_MISMATCH",
      "Payment verification does not match this order.",
    );
    if (attempt.status === "succeeded") {
      assert(
        attempt.transaction_id === payment.transactionId,
        409,
        "TRANSACTION_CONFLICT",
        "This reference already has a different transaction.",
      );
      return { orderId: attempt.order_id, fulfilled: true };
    }
    const duplicate = (
      await tx.query(
        "SELECT id FROM app_private.payment_attempts WHERE transaction_id=$1 AND id<>$2",
        [payment.transactionId, attempt.id],
      )
    ).rows.length;
    assert(
      !duplicate,
      409,
      "TRANSACTION_CONFLICT",
      "This transaction was already processed.",
    );
    await tx.query(
      "UPDATE app_private.payment_attempts SET status='succeeded',transaction_id=$2 WHERE id=$1",
      [attempt.id, payment.transactionId],
    );
    await tx.query(
      "UPDATE app_private.orders SET status='paid',paid_at=now() WHERE id=$1",
      [attempt.order_id],
    );
    const alreadyOwned =
      (
        await tx.query(
          "SELECT 1 FROM app_private.entitlements WHERE owner_id=$1 AND product_id=$2",
          [order.buyer_id, order.product_id],
        )
      ).rows.length > 0;
    await tx.query(
      "INSERT INTO app_private.entitlements(id,owner_id,product_id,origin_order_id) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,product_id) DO NOTHING",
      [randomUUID(), order.buyer_id, order.product_id, attempt.order_id],
    );
    await tx.query(
      "INSERT INTO app_private.audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'payment_verified',$3)",
      [randomUUID(), order.buyer_id, attempt.order_id],
    );
    await tx.query(
      "INSERT INTO app_private.payment_receipts(id,order_id) SELECT $1,$2 WHERE $3<>'development' ON CONFLICT(order_id) DO NOTHING",
      [randomUUID(), attempt.order_id, order.environment],
    );
    if (alreadyOwned)
      await tx.query(
        "INSERT INTO app_private.audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'duplicate_purchase_review',$3)",
        [randomUUID(), order.buyer_id, attempt.order_id],
      );
    return { orderId: attempt.order_id, fulfilled: true };
  });
}
export async function ownership(db: Sql, actor: string) {
  return (
    await db.query<{ productId: string; mode: string; state: string }>(
      `SELECT e.product_id AS "productId",p.mode,e.state FROM app_private.entitlements e JOIN app_private.products p ON p.id=e.product_id WHERE e.owner_id=$1 ORDER BY p.id`,
      [actor],
    )
  ).rows;
}
