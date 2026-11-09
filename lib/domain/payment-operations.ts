import { randomUUID } from "node:crypto";
import type { Database } from "../db/types";
import { AppError, assert } from "./errors";
import { account } from "./accounts";
import { hash, lockPrincipal } from "./identity";
import {
  preparePayment,
  readOrder,
  fulfilPayment,
  VerifiedPayment,
} from "./commerce";
export interface PaymentProvider {
  config: { environment: "test" | "live" };
  initialize(input: {
    reference: string;
    email: string;
    amountMinor: number;
    currency: string;
    orderId: string;
  }): Promise<string>;
  verify(reference: string, email: string): Promise<VerifiedPayment>;
}
export async function checkout(
  db: Database,
  actor: string,
  id: string,
  provider: PaymentProvider,
) {
  const order = await readOrder(db, actor, id);
  assert(
    order.environment === provider.config.environment,
    409,
    "ENVIRONMENT_MISMATCH",
    "This order belongs to a different payment environment.",
  );
  const buyer = await account(db, actor);
  assert(
    buyer.kind === "verified",
    403,
    "VERIFIED_EMAIL_REQUIRED",
    "Verify your email first.",
  );
  const p = await preparePayment(db, actor, id, "paystack"),
    lease = randomUUID();
  const claim = await db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await tx.query("SELECT id FROM app_private.orders WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    const current = await readOrder(tx, actor, id);
    if (current.status === "paid") return { paid: true } as const;
    assert(
      current.status === "pending",
      422,
      "CHECKOUT_CLOSED",
      "This quote expired. Create a new order.",
    );
    const a = (
      await tx.query<{
        authorization_url: string | null;
        setup_state: string;
        busy: boolean;
      }>(
        "SELECT authorization_url,setup_state,(setup_until>now()) AS busy FROM app_private.payment_attempts WHERE reference=$1 FOR UPDATE",
        [p.reference],
      )
    ).rows[0];
    if (a.authorization_url) return { url: a.authorization_url } as const;
    if (a.setup_state === "initialising" && !a.busy)
      await tx.query(
        "UPDATE app_private.payment_attempts SET setup_state='uncertain' WHERE reference=$1",
        [p.reference],
      );
    if (a.setup_state !== "new")
      return {
        failure:
          a.setup_state === "initialising" && a.busy
            ? "CHECKOUT_IN_PROGRESS"
            : "PAYMENT_SETUP_UNCERTAIN",
      } as const;
    await tx.query(
      "UPDATE app_private.payment_attempts SET setup_state='initialising',setup_lease=$2,setup_until=now()+interval '30 seconds' WHERE reference=$1",
      [p.reference, lease],
    );
    return { initialize: true } as const;
  });
  if ("url" in claim) return { authorizationUrl: claim.url, orderId: id };
  if ("paid" in claim) return { authorizationUrl: null, orderId: id };
  if ("failure" in claim)
    throw new AppError(
      409,
      claim.failure!,
      claim.failure === "CHECKOUT_IN_PROGRESS"
        ? "Payment setup is in progress. Please wait, then try again."
        : "Payment setup could not be confirmed. Check its status before starting another order.",
    );
  try {
    const url = await provider.initialize({
      reference: p.reference,
      email: buyer.email,
      amountMinor: order.amountMinor,
      currency: order.currency,
      orderId: id,
    });
    const stored = await db.query(
      "UPDATE app_private.payment_attempts SET authorization_url=$3,setup_state='ready',setup_until=NULL WHERE reference=$1 AND setup_lease=$2 RETURNING id",
      [p.reference, lease, url],
    );
    assert(
      stored.rows.length,
      409,
      "SETUP_LEASE_LOST",
      "Check the payment status before retrying.",
    );
    return { authorizationUrl: url, orderId: id };
  } catch (e) {
    await db.query(
      "UPDATE app_private.payment_attempts SET setup_state='uncertain',setup_until=NULL WHERE reference=$1 AND setup_lease=$2",
      [p.reference, lease],
    );
    throw e;
  }
}
export async function verifyReference(
  db: Database,
  reference: string,
  provider: PaymentProvider,
  expectedTransactionId?: string,
) {
  const row = (
    await db.query<{ email: string; environment: string; order_id: string }>(
      "SELECT a.email,o.environment,p.order_id FROM app_private.payment_attempts p JOIN app_private.orders o ON o.id=p.order_id JOIN app_private.accounts a ON a.principal_id=o.buyer_id WHERE p.reference=$1 AND p.provider='paystack'",
      [reference],
    )
  ).rows[0];
  assert(row, 404, "REFERENCE_UNKNOWN", "Payment reference unavailable.");
  assert(
    row.environment === provider.config.environment,
    409,
    "ENVIRONMENT_MISMATCH",
    "Wrong payment environment.",
  );
  const result = await provider.verify(reference, row.email);
  assert(
    result.reference === reference &&
      result.environment === row.environment &&
      (!expectedTransactionId ||
        result.transactionId === expectedTransactionId),
    409,
    "PAYMENT_MISMATCH",
    "The verification does not match this payment event.",
  );
  if (result.success) await fulfilPayment(db, result);
  await db.query(
    "UPDATE app_private.payment_attempts SET next_verify_at=now()+interval '5 minutes' WHERE reference=$1",
    [reference],
  );
  return { paid: result.success, orderId: row.order_id };
}
export async function verifyOrder(
  db: Database,
  actor: string,
  id: string,
  provider: PaymentProvider,
) {
  const order = await readOrder(db, actor, id);
  assert(
    order.environment === provider.config.environment,
    409,
    "ENVIRONMENT_MISMATCH",
    "Wrong payment environment.",
  );
  const p = (
    await db.query<{ reference: string }>(
      "SELECT reference FROM app_private.payment_attempts WHERE order_id=$1 AND provider='paystack'",
      [id],
    )
  ).rows[0];
  assert(p, 409, "NO_PAYMENT_ATTEMPT", "Start checkout first.");
  await verifyReference(db, p.reference, provider);
  return readOrder(db, actor, id);
}
export async function receiveWebhook(
  db: Database,
  event: {
    eventType: string;
    reference: string | null;
    transactionId: string | null;
  },
  environment: string,
  raw: Buffer,
) {
  const key = event.reference
    ? hash(
        [
          "paystack",
          environment,
          event.eventType,
          event.reference,
          event.transactionId,
        ].join(":"),
      )
    : hash(raw.toString("base64"));
  await db.query(
    "INSERT INTO app_private.webhook_inbox(id,dedup_key,event_type,reference,transaction_id,state,environment,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6='ignored' THEN now() ELSE NULL END) ON CONFLICT(dedup_key) DO NOTHING",
    [
      randomUUID(),
      key,
      event.eventType,
      event.reference,
      event.transactionId,
      event.eventType === "charge.success" ? "pending" : "ignored",
      environment,
    ],
  );
  return { received: true };
}
const permanent = new Set([
  "PAYMENT_MISMATCH",
  "ENVIRONMENT_MISMATCH",
  "REFERENCE_UNKNOWN",
  "TRANSACTION_CONFLICT",
]);
export async function processInbox(
  db: Database,
  provider: PaymentProvider,
  limit = 5,
) {
  const lease = randomUUID();
  const rows = await db.transaction(async (tx) => {
    const selected = (
      await tx.query<{ id: string; reference: string; transaction_id: string }>(
        "SELECT id,reference,transaction_id FROM app_private.webhook_inbox WHERE environment=$2 AND ((state='pending' AND next_attempt_at<=now()) OR (state='processing' AND lease_until<=now())) ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED",
        [limit, provider.config.environment],
      )
    ).rows;
    for (const r of selected)
      await tx.query(
        "UPDATE app_private.webhook_inbox SET state='processing',lease=$2,lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=$1",
        [r.id, lease],
      );
    return selected;
  });
  let completed = 0;
  for (const r of rows) {
    let code: string | null = null,
      paid = false;
    try {
      paid = (
        await verifyReference(db, r.reference, provider, r.transaction_id)
      ).paid;
    } catch (e) {
      code = e instanceof AppError ? e.code : "PROVIDER_UNAVAILABLE";
    }
    const state = paid
      ? "done"
      : code && permanent.has(code)
        ? "exception"
        : "pending";
    await db.query(
      "UPDATE app_private.webhook_inbox SET state=$3,error_code=$4,next_attempt_at=now()+interval '5 minutes',completed_at=CASE WHEN $3 IN ('done','exception') THEN now() ELSE NULL END,lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2",
      [r.id, lease, state, code],
    );
    if (paid) completed++;
  }
  return { claimed: rows.length, completed };
}
export async function reconcilePayments(
  db: Database,
  provider: PaymentProvider,
  limit = 5,
) {
  const references = await db.transaction(async (tx) => {
    const rows = (
      await tx.query<{ reference: string }>(
        "SELECT p.reference FROM app_private.payment_attempts p JOIN app_private.orders o ON o.id=p.order_id WHERE p.provider='paystack' AND p.status='pending' AND p.next_verify_at<=now() AND o.environment=$2 ORDER BY p.next_verify_at,p.id LIMIT $1 FOR UPDATE OF p SKIP LOCKED",
        [limit, provider.config.environment],
      )
    ).rows;
    for (const r of rows)
      await tx.query(
        "UPDATE app_private.payment_attempts SET next_verify_at=now()+interval '5 minutes' WHERE reference=$1",
        [r.reference],
      );
    return rows;
  });
  let verified = 0,
    exceptions = 0;
  for (const r of references) {
    try {
      if ((await verifyReference(db, r.reference, provider)).paid) verified++;
    } catch (e) {
      if (e instanceof AppError && permanent.has(e.code)) {
        await db.query(
          "INSERT INTO app_private.webhook_inbox(id,dedup_key,event_type,reference,state,error_code,environment,completed_at) VALUES($1,$2,'reconciliation',$3,'exception',$4,$5,now()) ON CONFLICT(dedup_key) DO NOTHING",
          [
            randomUUID(),
            hash("reconciliation:" + r.reference + ":" + e.code),
            r.reference,
            e.code,
            provider.config.environment,
          ],
        );
        exceptions++;
      }
    }
  }
  return { checked: references.length, verified, exceptions };
}
export type Receipt = {
  id: string;
  orderId: string;
  to: string;
  amountMinor: number;
  currency: string;
  environment: string;
};
export async function deliverReceipts(
  db: Database,
  send: (r: Receipt) => Promise<void>,
  limit = 5,
) {
  const lease = randomUUID(),
    receipts = await db.transaction(async (tx) => {
      const rows = (
        await tx.query<Receipt>(
          `SELECT r.id,r.order_id AS "orderId",a.email AS "to",o.amount_minor::integer AS "amountMinor",o.currency,o.environment FROM app_private.payment_receipts r JOIN app_private.orders o ON o.id=r.order_id JOIN app_private.accounts a ON a.principal_id=o.buyer_id WHERE (r.state='pending' AND r.next_attempt_at<=now()) OR (r.state='sending' AND r.lease_until<=now()) ORDER BY r.id LIMIT $1 FOR UPDATE OF r SKIP LOCKED`,
          [limit],
        )
      ).rows;
      for (const r of rows)
        await tx.query(
          "UPDATE app_private.payment_receipts SET state='sending',lease=$2,lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=$1",
          [r.id, lease],
        );
      return rows;
    });
  let sent = 0;
  for (const r of receipts) {
    let okay = false;
    try {
      await send(r);
      okay = true;
      sent++;
    } catch {}
    await db.query(
      "UPDATE app_private.payment_receipts SET state=$3,sent_at=CASE WHEN $3='sent' THEN now() ELSE NULL END,next_attempt_at=now()+interval '5 minutes',lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2",
      [r.id, lease, okay ? "sent" : "pending"],
    );
  }
  return { claimed: receipts.length, sent };
}
