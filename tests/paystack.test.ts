import { beforeAll, afterAll, it, expect } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity } from "../lib/domain/identity";
import { createOrder, readOrder, ownership } from "../lib/domain/commerce";
import {
  checkout,
  verifyOrder,
  receiveWebhook,
  processInbox,
  reconcilePayments,
  deliverReceipts,
  PaymentProvider,
} from "../lib/domain/payment-operations";
import {
  PaystackClient,
  validWebhook,
  parseWebhook,
  checkoutConfig,
  paystackConfig,
  PaystackConfig,
} from "../lib/providers/paystack";
let db: Database;
const config: PaystackConfig = {
  secret: "sk_test_" + "a".repeat(32),
  environment: "test",
  appUrl: "https://plotrush.example",
  webhookSecret: "whsec_" + "b".repeat(32),
  allowLegacy: false,
};
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
async function order() {
  const actor = (await createIdentity(db)).id,
    email = randomUUID() + "@example.test";
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [actor, email],
  );
  const o = await createOrder(
    db,
    actor,
    {
      productId: "wedding-gift-solo",
      priceVersionId: "demo-wedding-solo-ngn-v1",
      idempotencyKey: randomUUID(),
    },
    "test",
    false,
    true,
  );
  return { actor, email, o };
}
let transactionCounter = 100;
function fake(): PaymentProvider & {
  calls: number;
  initCalls: number;
  lastRef: string;
  success: boolean;
  transactionId: string;
} {
  return {
    config: { environment: "test" },
    calls: 0,
    initCalls: 0,
    lastRef: "",
    success: true,
    transactionId: String(++transactionCounter),
    async initialize(i) {
      this.initCalls++;
      this.lastRef = i.reference;
      return "https://checkout.paystack.com/test";
    },
    async verify(reference) {
      this.calls++;
      return {
        reference,
        transactionId: this.transactionId,
        amountMinor: 200000,
        currency: "NGN",
        environment: "test",
        success: this.success,
      };
    },
  };
}
function signed(
  raw: Buffer,
  secret = config.webhookSecret!,
  seconds = Math.floor(Date.now() / 1000),
) {
  const sig = createHmac("sha512", secret)
    .update(seconds + ".")
    .update(raw)
    .digest("hex");
  return new Headers({
    "Paystack-Signature": `t=${seconds},v1=whk_test:${sig}`,
  });
}
it("requires explicit matching test configuration and never enables live billing", () => {
  expect(
    paystackConfig({
      PAYSTACK_SECRET_KEY: "replace_me",
      APP_URL: config.appUrl,
    }),
  ).toBeNull();
  expect(
    checkoutConfig({
      FEATURE_PAYMENTS: "true",
      PAYMENT_PROVIDER: "paystack",
      PAYSTACK_ENVIRONMENT: "test",
      PAYSTACK_SECRET_KEY: config.secret,
      PAYSTACK_WEBHOOK_SECRET: config.webhookSecret,
      APP_URL: config.appUrl,
    }).available,
  ).toBe(true);
  expect(
    checkoutConfig({
      FEATURE_PAYMENTS: "true",
      PAYMENT_PROVIDER: "paystack",
      PAYSTACK_ENVIRONMENT: "live",
      PAYSTACK_SECRET_KEY: config.secret.replace("sk_test_", "sk_live_"),
      PAYSTACK_WEBHOOK_SECRET: config.webhookSecret,
      APP_URL: config.appUrl,
    }).available,
  ).toBe(false);
});
it("validates raw modern signatures, rotation and timestamp replay without legacy downgrade", () => {
  const raw = Buffer.from(
      '{ "event": "charge.success", "data": {"id":1,"reference":"r"} }',
    ),
    headers = signed(raw);
  expect(validWebhook(raw, headers, config)).toBe(true);
  expect(
    validWebhook(
      Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
      headers,
      config,
    ),
  ).toBe(false);
  expect(
    validWebhook(
      raw,
      signed(raw, config.webhookSecret, Math.floor(Date.now() / 1000) - 301),
      config,
    ),
  ).toBe(false);
  expect(
    validWebhook(raw, signed(raw, "whsec_old"), {
      ...config,
      previousWebhookSecret: "whsec_old",
    }),
  ).toBe(true);
  const legacy = createHmac("sha512", config.secret).update(raw).digest("hex");
  expect(
    validWebhook(raw, new Headers({ "x-paystack-signature": legacy }), config),
  ).toBe(false);
  expect(
    validWebhook(raw, new Headers({ "x-paystack-signature": legacy }), {
      ...config,
      allowLegacy: true,
    }),
  ).toBe(true);
  expect(
    validWebhook(
      raw,
      new Headers({
        "paystack-signature": "broken",
        "x-paystack-signature": legacy,
      }),
      { ...config, allowLegacy: true },
    ),
  ).toBe(false);
});
it("preserves unsigned 64-bit IDs and sends server-controlled initialization fields", async () => {
  let sent: Record<string, unknown> = {};
  const client = new PaystackClient(config, async (url, init) => {
    if (String(url).endsWith("/initialize")) {
      sent = JSON.parse(init!.body as string);
      return Response.json({
        status: true,
        data: {
          reference: sent.reference,
          authorization_url: "https://checkout.paystack.com/test",
        },
      });
    }
    return new Response(
      '{"status":true,"data":{"id":18446744073709551615,"domain":"test","status":"success","reference":"ref-1","amount":200000,"currency":"NGN","customer":{"email":"buyer@example.test"},"authorization":{"secret":"discard"}}}',
    );
  });
  await client.initialize({
    reference: "ref-1",
    email: "buyer@example.test",
    amountMinor: 200000,
    currency: "NGN",
    orderId: "order-id",
  });
  expect(sent).toMatchObject({
    amount: "200000",
    currency: "NGN",
    callback_url: "https://plotrush.example/orders/order-id",
  });
  expect(
    (await client.verify("ref-1", "buyer@example.test")).transactionId,
  ).toBe("18446744073709551615");
  expect(
    parseWebhook(
      Buffer.from(
        '{"event":"charge.success","data":{"id":18446744073709551615,"reference":"ref-1"}}',
      ),
    ).transactionId,
  ).toBe("18446744073709551615");
});
it("rejects malicious checkout URLs, mismatched environment/reference/email and top-level fake success", async () => {
  const bad = new PaystackClient(config, async () =>
    Response.json({
      status: true,
      data: { reference: "r", authorization_url: "https://evil.example/steal" },
    }),
  );
  await expect(
    bad.initialize({
      reference: "r",
      email: "b@example.test",
      amountMinor: 1,
      currency: "NGN",
      orderId: "o",
    }),
  ).rejects.toMatchObject({ code: "CHECKOUT_URL_INVALID" });
  for (const patch of [
    { domain: "live" },
    { reference: "other" },
    { customer: { email: "other@example.test" } },
  ]) {
    const c = new PaystackClient(config, async () =>
      Response.json({
        status: true,
        data: {
          id: 1,
          domain: "test",
          status: "success",
          reference: "r",
          amount: 200000,
          currency: "NGN",
          customer: { email: "b@example.test" },
          ...patch,
        },
      }),
    );
    await expect(c.verify("r", "b@example.test")).rejects.toMatchObject({
      code: "PAYMENT_MISMATCH",
    });
  }
  const pending = new PaystackClient(config, async () =>
    Response.json({
      status: true,
      data: {
        id: 1,
        domain: "test",
        status: "pending",
        reference: "r",
        amount: 200000,
        currency: "NGN",
        customer: { email: "b@example.test" },
      },
    }),
  );
  expect((await pending.verify("r", "b@example.test")).success).toBe(false);
});
it("initializes once under duplicate requests, persists the reference first and reuses its checkout URL", async () => {
  const g = await order(),
    p = fake();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  p.initialize = async (i) => {
    p.initCalls++;
    p.lastRef = i.reference;
    expect(
      (
        await db.query(
          "SELECT 1 FROM app_private.payment_attempts WHERE reference=$1",
          [i.reference],
        )
      ).rows,
    ).toHaveLength(1);
    await gate;
    return "https://checkout.paystack.com/test";
  };
  const first = checkout(db, g.actor, g.o.id, p);
  await expect.poll(() => p.initCalls).toBe(1);
  await expect(checkout(db, g.actor, g.o.id, p)).rejects.toMatchObject({
    code: "CHECKOUT_IN_PROGRESS",
  });
  release();
  const result = await first;
  expect(await checkout(db, g.actor, g.o.id, p)).toEqual(result);
  expect(p.initCalls).toBe(1);
});
it("a timed out initialization never invents a second reference or retries a possibly accepted charge", async () => {
  const g = await order(),
    p = fake();
  p.initialize = async () => {
    p.initCalls++;
    throw Error("timeout");
  };
  await expect(checkout(db, g.actor, g.o.id, p)).rejects.toThrow();
  await expect(checkout(db, g.actor, g.o.id, p)).rejects.toMatchObject({
    code: "PAYMENT_SETUP_UNCERTAIN",
  });
  expect(p.initCalls).toBe(1);
});
it("durably deduplicates signed events, verifies externally and grants once with a receipt outbox", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  const event = {
    eventType: "charge.success",
    reference: p.lastRef,
    transactionId: p.transactionId,
  };
  await Promise.all([
    receiveWebhook(db, event, "test", Buffer.from("{}")),
    receiveWebhook(db, event, "test", Buffer.from("{}")),
  ]);
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.webhook_inbox WHERE reference=$1",
        [p.lastRef],
      )
    ).rows,
  ).toHaveLength(1);
  expect(await ownership(db, g.actor)).toEqual([]);
  await processInbox(db, p);
  expect((await readOrder(db, g.actor, g.o.id)).status).toBe("paid");
  await verifyOrder(db, g.actor, g.o.id, p);
  expect(await ownership(db, g.actor)).toHaveLength(1);
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.payment_receipts WHERE order_id=$1",
        [g.o.id],
      )
    ).rows,
  ).toHaveLength(1);
});
it("keeps pending verification retryable and mismatched event transaction IDs quarantined", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  p.success = false;
  await receiveWebhook(
    db,
    {
      eventType: "charge.success",
      reference: p.lastRef,
      transactionId: p.transactionId,
    },
    "test",
    Buffer.from("{}"),
  );
  await processInbox(db, p);
  expect((await readOrder(db, g.actor, g.o.id)).status).toBe("pending");
  await db.query(
    "UPDATE app_private.webhook_inbox SET next_attempt_at=now(),transaction_id='wrong' WHERE reference=$1",
    [p.lastRef],
  );
  p.success = true;
  await processInbox(db, p);
  expect(
    (
      await db.query<{ state: string }>(
        "SELECT state FROM app_private.webhook_inbox WHERE reference=$1",
        [p.lastRef],
      )
    ).rows[0].state,
  ).toBe("exception");
  expect(await ownership(db, g.actor)).toEqual([]);
});
it("recovers missing webhook/late success and never reads another buyer's order", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  await db.query(
    "UPDATE app_private.orders SET expires_at=now()-interval '1 day' WHERE id=$1",
    [g.o.id],
  );
  await db.query(
    "UPDATE app_private.payment_attempts SET next_verify_at=now() WHERE order_id=$1",
    [g.o.id],
  );
  expect((await reconcilePayments(db, p)).verified).toBeGreaterThan(0);
  expect((await readOrder(db, g.actor, g.o.id)).status).toBe("paid");
  await expect(
    verifyOrder(db, (await createIdentity(db)).id, g.o.id, p),
  ).rejects.toMatchObject({ status: 404 });
});
it("receipt delivery retries independently without losing a paid order", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  await verifyOrder(db, g.actor, g.o.id, p);
  await deliverReceipts(
    db,
    async () => {
      throw Error("mail down");
    },
    100,
  );
  expect((await readOrder(db, g.actor, g.o.id)).status).toBe("paid");
  await db.query(
    "UPDATE app_private.payment_receipts SET next_attempt_at=now() WHERE order_id=$1",
    [g.o.id],
  );
  const messages: string[] = [];
  await deliverReceipts(
    db,
    async (r) => {
      messages.push(r.orderId);
    },
    100,
  );
  expect(messages).toContain(g.o.id);
  expect(
    (
      await db.query<{ state: string }>(
        "SELECT state FROM app_private.payment_receipts WHERE order_id=$1",
        [g.o.id],
      )
    ).rows[0].state,
  ).toBe("sent");
});
it("records permanent reconciliation mismatches without granting access", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  // A provider response with the wrong verified amount is a permanent domain mismatch.
  p.verify = async (reference) => ({
    reference,
    transactionId: p.transactionId,
    amountMinor: 1,
    currency: "NGN",
    environment: "test",
    success: true,
  });
  await db.query(
    "UPDATE app_private.payment_attempts SET next_verify_at=now() WHERE order_id=$1",
    [g.o.id],
  );
  expect((await reconcilePayments(db, p, 100)).exceptions).toBeGreaterThan(0);
  expect(await ownership(db, g.actor)).toEqual([]);
  expect(
    (
      await db.query(
        "SELECT environment,state FROM app_private.webhook_inbox WHERE reference=$1 AND event_type='reconciliation'",
        [p.lastRef],
      )
    ).rows,
  ).toEqual([{ environment: "test", state: "exception" }]);
});
it("recovers abandoned inbox leases while concurrent workers claim an event once", async () => {
  const g = await order(),
    p = fake();
  await checkout(db, g.actor, g.o.id, p);
  await receiveWebhook(
    db,
    {
      eventType: "charge.success",
      reference: p.lastRef,
      transactionId: p.transactionId,
    },
    "test",
    Buffer.from("{}"),
  );
  await db.query(
    "UPDATE app_private.webhook_inbox SET state='processing',lease=$2,lease_until=now()-interval '1 minute' WHERE reference=$1",
    [p.lastRef, randomUUID()],
  );
  const results = await Promise.all([
    processInbox(db, p, 100),
    processInbox(db, p, 100),
  ]);
  expect(results.reduce((n, r) => n + r.completed, 0)).toBe(1);
  expect(await ownership(db, g.actor)).toHaveLength(1);
});
