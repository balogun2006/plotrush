import { reconcileDispute } from "../lib/domain/disputes";
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
  recoverRequestedRefunds,
} from "../lib/domain/refunds";
import { listEditorial } from "../lib/domain/editorial";
import { exportFinanceRevenue } from "../lib/domain/finance-revenue";
import { read, start } from "../lib/domain/game";
import {
  PaystackClient,
  type VerifiedRefund,
  type VerifiedDispute,
} from "../lib/providers/paystack";
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
async function paidOrder(
  actor: string,
  transactionId = randomUUID(),
  mode = "solo",
) {
  const order = await createOrder(
    db,
    actor,
    {
      productId: caseId + "-" + mode,
      priceVersionId: `demo-wedding-${mode}-ngn-v1`,
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

it("recovers matching refunds for open sandbox requests and preserves investigations", async () => {
  const owner = await account();
  const order = await paidOrder(owner.id);
  const attempt = await start(db, owner.id, caseId, policy);
  const refund: VerifiedRefund = {
    id: "501",
    transactionId: order.payment.transactionId,
    environment: "test",
    currency: order.currency,
    amountMinor: order.amountMinor / 2,
    status: "processed",
  };
  const listRefunds = vi.fn<() => Promise<VerifiedRefund[]>>();
  const provider = { config: { environment: "test" } as const, listRefunds };
  const due = () =>
    db.query(
      "UPDATE app_private.refund_requests SET next_reconcile_at=now() WHERE order_id=$1",
      [order.id],
    );
  expect((await recoverRequestedRefunds(db, provider)).checked).toBe(0);
  await requestRefund(db, owner.id, order.id, "Recover a test refund");
  expect(
    (
      await recoverRequestedRefunds(db, {
        ...provider,
        config: { environment: "live" },
      })
    ).checked,
  ).toBe(0);
  expect(listRefunds).not.toHaveBeenCalled();
  listRefunds.mockRejectedValueOnce(new Error("Timed out"));
  expect(await recoverRequestedRefunds(db, provider)).toMatchObject({
    checked: 1,
    unavailable: 1,
  });
  expect((await recoverRequestedRefunds(db, provider)).checked).toBe(0);
  await due();
  listRefunds.mockResolvedValueOnce([
    refund,
    { ...refund, id: "502", currency: "GBP" },
  ]);
  expect(await recoverRequestedRefunds(db, provider)).toMatchObject({
    recorded: 0,
    mismatches: 1,
  });
  expect((await readOrder(db, owner.id, order.id)).refundedMinor).toBe(0);
  await due();
  const second = { ...refund, id: "502" };
  listRefunds.mockResolvedValueOnce([
    refund,
    { ...second, status: "processing" },
  ]);
  expect(await recoverRequestedRefunds(db, provider)).toMatchObject({
    recorded: 1,
  });
  expect(listRefunds).toHaveBeenLastCalledWith(
    order.payment.transactionId,
    order.currency,
  );
  expect((await start(db, owner.id, caseId, policy)).id).toBe(attempt.id);
  await due();
  listRefunds.mockResolvedValue([refund, second]);
  const recovery = await Promise.all([
    recoverRequestedRefunds(db, provider),
    recoverRequestedRefunds(db, provider),
  ]);
  expect(recovery.map((r) => r.recorded).sort()).toEqual([0, 1]);
  expect(await readOrder(db, owner.id, order.id)).toMatchObject({
    refundedMinor: order.amountMinor,
    refundRequested: false,
  });
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  expect((await read(db, owner.id, attempt.id)).id).toBe(attempt.id);
  expect(
    (
      await db.query(
        "SELECT id FROM app_private.audit_events WHERE entity_id=$1 AND action='refund.auto_reconciled'",
        [order.id],
      )
    ).rows,
  ).toHaveLength(2);
});

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
        '{"status":true,"data":{"transaction":9223372036854775807,"domain":"test","currency":"NGN","amount":200000,"status":"processed"}}',
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

it("pages through Paystack refunds filtered by transaction ID and currency", async () => {
  const transaction = "9223372036854775807";
  const transport = vi.fn<typeof fetch>();
  const record = {
    transaction,
    domain: "test",
    amount: 100,
    currency: "NGN",
    status: "processed",
  };
  transport
    .mockResolvedValueOnce(
      Response.json({
        status: true,
        data: Array.from({ length: 20 }, (_, i) => ({ ...record, id: i + 1 })),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ status: true, data: [{ ...record, id: 21 }] }),
    );
  const client = new PaystackClient(
    {
      environment: "test",
      secret: "sk_test_demo",
      appUrl: "https://plotrush.example",
      allowLegacy: false,
    },
    transport,
  );
  const refunds = await client.listRefunds(transaction, "NGN");
  expect(refunds).toHaveLength(21);
  expect(refunds.at(-1)).toMatchObject({
    id: "21",
    transactionId: transaction,
  });
  expect(
    transport.mock.calls.map(([url, init]) => [String(url), init?.method]),
  ).toEqual([
    [
      "https://api.paystack.co/refund?transaction=" +
        transaction +
        "&currency=NGN&perPage=20&page=1",
      "GET",
    ],
    [
      "https://api.paystack.co/refund?transaction=" +
        transaction +
        "&currency=NGN&perPage=20&page=2",
      "GET",
    ],
  ]);
});

it("holds access for matched Paystack disputes and releases only after every hold clears", async () => {
  const owner = await account();
  const order = await paidOrder(owner.id);
  const finance = await staff("finance");
  const attempt = await start(db, owner.id, caseId, policy);
  const initial: VerifiedDispute = {
    id: "789",
    status: "awaiting-bank-feedback",
    resolution: "declined",
    currency: null,
    refund_amount: null,
    domain: "test",
    updatedAt: "2026-11-09T12:00:00.000Z",
    transaction: {
      id: order.payment.transactionId,
      reference: order.payment.reference,
      amount: order.amountMinor,
      currency: order.currency,
      domain: "test",
    },
  };
  const get = vi.fn(async () => initial);
  await expect(
    reconcileDispute(
      db,
      { ...finance, staffToken: undefined },
      order.id,
      initial.id,
      { fetchDispute: get },
    ),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  expect(get).not.toHaveBeenCalled();
  for (const transaction of [
    { ...initial.transaction, reference: "wrong" },
    { ...initial.transaction, amount: 1 },
    { ...initial.transaction, currency: "GBP" },
    { ...initial.transaction, domain: "live" as const },
  ]) {
    await expect(
      reconcileDispute(db, finance, order.id, initial.id, {
        fetchDispute: async () => ({ ...initial, transaction }),
      }),
    ).rejects.toMatchObject({ code: "DISPUTE_MISMATCH" });
  }
  const sync = (d: VerifiedDispute) =>
    reconcileDispute(db, finance, order.id, d.id, {
      fetchDispute: async () => d,
    });
  const [first, retry] = await Promise.all([sync(initial), sync(initial)]);
  expect(first).toEqual(retry);
  expect(first.holdsAccess).toBe(true);
  expect((await readOrder(db, owner.id, order.id)).disputeHold).toBe(true);
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  expect((await read(db, owner.id, attempt.id)).id).toBe(attempt.id);
  expect(
    (await financeOrders(db, finance, "")).find((o) => o.id === order.id)
      ?.disputes,
  ).toEqual([first]);
  const second = { ...initial, id: "790", status: "pending", resolution: null };
  await sync(second);
  const resolved = {
    ...initial,
    status: "resolved",
    updatedAt: "2026-11-09T13:00:00.000Z",
  };
  expect((await sync(resolved)).holdsAccess).toBe(false);
  expect((await sync(initial)).status).toBe("resolved");
  await expect(
    sync({ ...resolved, resolution: "merchant-accepted" }),
  ).rejects.toMatchObject({ code: "DISPUTE_CONFLICT" });
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  await sync({ ...resolved, id: second.id });
  expect((await start(db, owner.id, caseId, policy)).id).toBe(attempt.id);
  const accepted = {
    ...resolved,
    updatedAt: "2026-11-09T14:00:00.000Z",
    resolution: "merchant-accepted",
    refund_amount: order.amountMinor,
  };
  expect((await sync(accepted)).holdsAccess).toBe(true);
  expect((await readOrder(db, owner.id, order.id)).refundedMinor).toBe(0);
  await reconcileRefund(db, finance, order.id, "880", {
    fetchRefund: async () => ({
      id: "880",
      transactionId: initial.transaction.id,
      amountMinor: order.amountMinor,
      currency: order.currency,
      environment: "test",
      status: "processed",
    }),
  });
  await sync({ ...resolved, updatedAt: "2026-11-09T15:00:00.000Z" });
  await expect(start(db, owner.id, caseId, policy)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  const events = await db.query(
    "SELECT 1 FROM app_private.audit_events WHERE entity_id=$1 AND action='dispute.reconciled'",
    [order.id],
  );
  expect(events.rows).toHaveLength(6);
});

it("fetches the documented dispute shape and discards unrelated provider data", async () => {
  const client = new PaystackClient(
    {
      environment: "test",
      secret: "sk_test_demo",
      appUrl: "https://plotrush.example",
      allowLegacy: false,
    },
    async (url, init) => {
      expect(url).toBe("https://api.paystack.co/dispute/2867");
      expect(init?.method).toBe("GET");
      return new Response(
        '{"status":true,"data":{"id":2867,"status":"archived","resolution":null,"refund_amount":null,"currency":null,"domain":"test","updatedAt":"2026-11-09T10:00:00.000Z","transaction":{"id":9223372036854775807,"reference":"ref","currency":"NGN","amount":200000,"domain":"test","authorization":{"example":"private"}},"customer":{"email":"fixture@example.test"}}}',
      );
    },
  );
  const dispute = await client.fetchDispute("2867");
  expect(dispute.transaction.id).toBe("9223372036854775807");
  expect(dispute).not.toHaveProperty("customer");
  expect(dispute.transaction).not.toHaveProperty("authorization");
});

it("exports UTC sandbox activity by currency and mode only to finance staff with MFA", async () => {
  const finance = await staff("finance"),
    editor = await staff("content_editor");
  const range = { from: "2025-02-01", to: "2025-02-01" };
  await expect(exportFinanceRevenue(db, editor, range)).rejects.toMatchObject({
    code: "ROLE_DENIED",
  });
  await expect(
    exportFinanceRevenue(db, { ...finance, staffToken: undefined }, range),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  for (const invalid of [
    { from: "2025-02-30", to: "2025-03-03" },
    { from: "2025-02-02", to: "2025-02-01" },
    { from: "2025-01-01", to: "2025-02-01" },
  ]) {
    await expect(
      exportFinanceRevenue(db, finance, invalid),
    ).rejects.toMatchObject({ code: "REPORT_RANGE_INVALID" });
  }
  const sale = await paidOrder((await account()).id);
  const olderSale = await paidOrder((await account()).id);
  const group = await paidOrder((await account()).id, randomUUID(), "group");
  const otherCurrency = await paidOrder((await account()).id);
  const nextDay = await paidOrder((await account()).id);
  const live = await paidOrder((await account()).id);
  const nonPaystack = await paidOrder((await account()).id);
  await db.query(
    "UPDATE app_private.orders SET paid_at='2025-02-01T00:00:00Z' WHERE id=ANY($1::uuid[])",
    [[sale.id, group.id, otherCurrency.id, live.id, nonPaystack.id]],
  );
  await db.query(
    "UPDATE app_private.orders SET paid_at='2025-01-31T23:59:59Z' WHERE id=$1",
    [olderSale.id],
  );
  await db.query(
    "UPDATE app_private.orders SET paid_at='2025-02-02T00:00:00Z' WHERE id=$1",
    [nextDay.id],
  );
  await db.query("UPDATE app_private.orders SET currency='GBP' WHERE id=$1", [
    otherCurrency.id,
  ]);
  await db.query(
    "UPDATE app_private.orders SET environment='live' WHERE id=$1",
    [live.id],
  );
  await db.query(
    "UPDATE app_private.payment_attempts SET provider='other' WHERE order_id=$1",
    [nonPaystack.id],
  );
  await db.query(
    "INSERT INTO app_private.refunds(provider_id,order_id,amount_minor,recorded_at) VALUES('601',$1,75000,'2025-02-01T00:00:00Z'),('602',$1,25000,'2025-02-01T23:59:59Z'),('603',$1,1000,'2025-02-02T00:00:00Z'),('604',$1,2000,'2025-02-03T00:00:00Z')",
    [olderSale.id],
  );
  const { csv, filename } = await exportFinanceRevenue(db, finance, range);
  expect(filename).toBe("plotrush-test-revenue-2025-02-01-2025-02-01.csv");
  expect(csv.trimEnd().split("\r\n").slice(1)).toEqual([
    `test,2025-02-01,2025-02-01,GBP,solo,${otherCurrency.amountMinor},0,${otherCurrency.amountMinor}`,
    `test,2025-02-01,2025-02-01,NGN,group,${group.amountMinor},0,${group.amountMinor}`,
    `test,2025-02-01,2025-02-01,NGN,solo,${sale.amountMinor},100000,${sale.amountMinor - 100000}`,
  ]);
  const { csv: followingDay } = await exportFinanceRevenue(db, finance, {
    from: "2025-02-02",
    to: "2025-02-02",
  });
  expect(followingDay).toContain(
    `NGN,solo,${nextDay.amountMinor},1000,${nextDay.amountMinor - 1000}`,
  );
  const { csv: refundOnly } = await exportFinanceRevenue(db, finance, {
    from: "2025-02-03",
    to: "2025-02-03",
  });
  expect(refundOnly).toContain("NGN,solo,0,2000,-2000");
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.audit_events WHERE actor_id=$1 AND action='finance.revenue_exported'",
        [finance.actor],
      )
    ).rows,
  ).toHaveLength(3);
});
