import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity, hash } from "../lib/domain/identity";
import {
  createOrder,
  fulfilPayment,
  preparePayment,
  readOrder,
} from "../lib/domain/commerce";
import {
  financeOrders,
  reconcileRefund,
  requestRefund,
  closeRefundRequest,
} from "../lib/domain/refunds";
import { listEditorial } from "../lib/domain/editorial";
import { read, start } from "../lib/domain/game";
import { PaystackClient, type VerifiedRefund } from "../lib/providers/paystack";
import type { StaffRole } from "../lib/domain/staff";

let db: Database;
const policy = { environment: "test", allowFixture: true } as const;
const caseId = "wedding-gift";
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());

async function account() {
  const account = await createIdentity(db);
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [account.id, randomUUID() + "@example.test"],
  );
  return account;
}
async function staff(role: StaffRole) {
  const actor = await account();
  const staffToken = randomUUID();
  await db.query(
    "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2)",
    [actor.id, [role]],
  );
  await db.query(
    "INSERT INTO app_private.staff_sessions(token_hash,principal_id,player_session_hash) VALUES($1,$2,$3)",
    [hash(staffToken), actor.id, hash(actor.token)],
  );
  return { actor: actor.id, playerToken: actor.token, staffToken };
}
async function paidOrder(actor: string, transactionId = randomUUID()) {
  const order = await createOrder(
    db,
    actor,
    {
      productId: caseId + "-solo",
      priceVersionId: "demo-wedding-solo-ngn-v1",
      idempotencyKey: randomUUID(),
    },
    "test",
    false,
    true,
    policy,
  );
  const payment = await preparePayment(db, actor, order.id, "paystack");
  const verified = {
    reference: payment.reference,
    transactionId,
    amountMinor: order.amountMinor,
    currency: order.currency,
    environment: "test" as const,
    success: true,
  };
  await fulfilPayment(db, verified);
  return { ...order, payment: verified };
}

it("isolates refund requests, deduplicates retries and protects the queue and editorial canon", async () => {
  const owner = await account(),
    stranger = await account();
  const order = await paidOrder(owner.id);
  const editor = await staff("content_editor");
  const finance = await staff("finance");
  await expect(
    requestRefund(db, stranger.id, order.id, "Wrong account"),
  ).rejects.toMatchObject({ status: 404 });
  await Promise.all([
    requestRefund(db, owner.id, order.id, "Buyer request"),
    requestRefund(db, owner.id, order.id, "Buyer request"),
  ]);
  expect((await readOrder(db, owner.id, order.id)).refundRequested).toBe(true);
  await expect(financeOrders(db, editor, "")).rejects.toMatchObject({
    code: "ROLE_DENIED",
  });
  await expect(
    financeOrders(db, { ...finance, staffToken: undefined }, ""),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  await expect(listEditorial(db, finance)).rejects.toMatchObject({
    code: "ROLE_DENIED",
  });
  const queue = await financeOrders(db, finance, "");
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    id: order.id,
    reason: "Buyer request",
    refundedMinor: 0,
  });
  await closeRefundRequest(
    db,
    finance,
    order.id,
    queue[0].requestId!,
    "Reviewed with the buyer",
  );
  expect(await financeOrders(db, finance, "")).toEqual([]);
  expect(
    (await financeOrders(db, finance, order.payment.reference))[0],
  ).toMatchObject({ id: order.id, reason: null });
  await requestRefund(db, owner.id, order.id, "Follow-up");
  await expect(
    closeRefundRequest(
      db,
      finance,
      order.id,
      queue[0].requestId!,
      "Stale action",
    ),
  ).rejects.toMatchObject({ status: 404 });
});

it("records only matching processed refunds, caps totals and revokes only the refunded purchase", async () => {
  const owner = await account();
  const order = await paidOrder(owner.id);
  const finance = await staff("finance");
  const attempt = await start(db, owner.id, caseId, policy);
  await requestRefund(db, owner.id, order.id, "Refund this test order");
  const matching: VerifiedRefund = {
    id: "101",
    transactionId: order.payment.transactionId,
    environment: "test",
    currency: order.currency,
    amountMinor: order.amountMinor / 2,
    status: "processed",
  };
  const fetchRefund = vi.fn(async () => matching);
  await expect(
    reconcileRefund(
      db,
      { ...finance, staffToken: undefined },
      order.id,
      "101",
      { fetchRefund },
    ),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  expect(fetchRefund).not.toHaveBeenCalled();
  for (const override of [
    { transactionId: "wrong" },
    { environment: "live" as const },
    { currency: "GBP" },
    { id: "999" },
  ]) {
    await expect(
      reconcileRefund(db, finance, order.id, "101", {
        fetchRefund: async () => ({ ...matching, ...override }),
      }),
    ).rejects.toMatchObject({ code: "REFUND_MISMATCH" });
  }
  expect(
    await reconcileRefund(db, finance, order.id, "101", {
      fetchRefund: async () => ({ ...matching, status: "processing" }),
    }),
  ).toMatchObject({ status: "processing", refundedMinor: 0 });
  const apply = () =>
    reconcileRefund(db, finance, order.id, "101", { fetchRefund });
  const partials = await Promise.all([apply(), apply()]);
  expect(partials.map((r) => r.refundedMinor)).toEqual([
    matching.amountMinor,
    matching.amountMinor,
  ]);
  expect((await start(db, owner.id, caseId, policy)).id).toBe(attempt.id);
  const second = async (amountMinor: number) =>
    reconcileRefund(db, finance, order.id, "102", {
      fetchRefund: async () => ({ ...matching, id: "102", amountMinor }),
    });
  await expect(second(matching.amountMinor + 1)).rejects.toMatchObject({
    code: "REFUND_TOTAL_EXCEEDED",
  });
  expect((await second(matching.amountMinor)).refundedMinor).toBe(
    order.amountMinor,
  );
  expect(await readOrder(db, owner.id, order.id)).toMatchObject({
    status: "paid",
    refundedMinor: order.amountMinor,
    refundRequested: false,
  });
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  expect((await read(db, owner.id, attempt.id)).id).toBe(attempt.id);
  await expect(
    requestRefund(db, owner.id, order.id, "Already refunded"),
  ).rejects.toMatchObject({ code: "ORDER_REFUNDED" });
  await fulfilPayment(db, order.payment);
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  await paidOrder(owner.id);
  await second(matching.amountMinor);
  expect((await start(db, owner.id, caseId, policy)).id).toBe(attempt.id);
  expect(
    (
      await db.query(
        "SELECT id FROM app_private.audit_events WHERE entity_id=$1 AND action='refund.reconciled'",
        [order.id],
      )
    ).rows,
  ).toHaveLength(2);
});

it("reads a provider refund over GET without losing large numeric transaction IDs", async () => {
  const client = new PaystackClient(
    {
      environment: "test",
      secret: "sk_test_demo",
      appUrl: "https://plotrush.example",
      allowLegacy: false,
    },
    async (url, init) => {
      expect(url).toBe("https://api.paystack.co/refund/41");
      expect(init?.method).toBe("GET");
      return new Response(
        '{"status":true,"data":{"id":41,"transaction":9223372036854775807,"domain":"test","currency":"NGN","amount":200000,"status":"processed"}}',
      );
    },
  );
  expect(await client.fetchRefund("41")).toEqual({
    id: "41",
    transactionId: "9223372036854775807",
    environment: "test",
    currency: "NGN",
    amountMinor: 200000,
    status: "processed",
  });
});
