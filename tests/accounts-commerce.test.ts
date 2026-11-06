import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import {
  createIdentity,
  identity,
  saveInterests,
  interests,
} from "../lib/domain/identity";
import {
  requestCode,
  verifyCode,
  account,
  signOut,
  Mailer,
} from "../lib/domain/accounts";
import { start, mutate, read } from "../lib/domain/game";
import { createRoom, roomAction } from "../lib/domain/rooms";
import {
  createOrder,
  preparePayment,
  fulfilPayment,
  readOrder,
  ownership,
  products,
  orderInput,
} from "../lib/domain/commerce";
import { localAdaptersAllowed, emailConfig } from "../lib/providers/email";
const secret = "test-secret-with-at-least-32-characters";
let db: Database;
const inbox = new Map<string, string>();
const mailer: Mailer = {
  send: async (m) => {
    inbox.set(m.challengeId, m.code);
  },
};
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
async function guest() {
  return createIdentity(db);
}
async function verified(email = randomUUID() + "@example.test") {
  const g = await guest(),
    c = await requestCode(db, g.id, email, secret, mailer);
  await verifyCode(db, g.id, c.challengeId, inbox.get(c.challengeId)!, secret);
  return g.id;
}
const quote = (mode = "solo", idempotencyKey = randomUUID()) => ({
  productId: "wedding-gift-" + mode,
  priceVersionId: "demo-wedding-" + mode + "-ngn-v1",
  idempotencyKey,
});
it("upgrades one guest without losing notes, interests or group seat, rotates sessions", async () => {
  const g = await guest(),
    a = await start(db, g.id, "last-slice");
  await mutate(db, g.id, a.id, "notes", {
    expectedVersion: a.stateVersion,
    text: "Keep these private notes",
  });
  await saveInterests(db, g.id, ["cold-case"], 0);
  const room = await createRoom(db, g.id, "missing-mic", "Me");
  const c = await requestCode(db, g.id, "UPGRADE@example.test", secret, mailer),
    v = await verifyCode(
      db,
      g.id,
      c.challengeId,
      inbox.get(c.challengeId)!,
      secret,
    );
  expect(v.account).toMatchObject({
    kind: "verified",
    email: "upgrade@example.test",
  });
  expect(await identity(db, g.token)).toBeNull();
  expect(await identity(db, v.token)).toBe(g.id);
  expect((await read(db, g.id, a.id)).notes).toContain("private notes");
  expect((await interests(db, g.id)).themes).toEqual(["cold-case"]);
  expect((await roomAction(db, g.id, room.room.id)).seat).toBe(0);
});
it("rejects wrong principal, replay, expired and superseded challenges", async () => {
  const a = await guest(),
    b = await guest();
  const c = await requestCode(db, a.id, "code@example.test", secret, mailer),
    code = inbox.get(c.challengeId)!;
  await expect(
    verifyCode(db, b.id, c.challengeId, code, secret),
  ).rejects.toMatchObject({ code: "CODE_INVALID" });
  await db.query(
    "UPDATE app_private.auth_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
    [c.challengeId],
  );
  await expect(
    verifyCode(db, a.id, c.challengeId, code, secret),
  ).rejects.toMatchObject({ code: "CODE_INVALID" });
  const old = await requestCode(db, a.id, "code@example.test", secret, mailer),
    fresh = await requestCode(db, a.id, "code@example.test", secret, mailer);
  await expect(
    verifyCode(db, a.id, old.challengeId, inbox.get(old.challengeId)!, secret),
  ).rejects.toMatchObject({ code: "CODE_INVALID" });
  await verifyCode(
    db,
    a.id,
    fresh.challengeId,
    inbox.get(fresh.challengeId)!,
    secret,
  );
  await expect(
    verifyCode(
      db,
      a.id,
      fresh.challengeId,
      inbox.get(fresh.challengeId)!,
      secret,
    ),
  ).rejects.toMatchObject({ code: "CODE_INVALID" });
});
it("persists the five-attempt bound even when verification fails", async () => {
  const g = await guest(),
    c = await requestCode(db, g.id, "limit@example.test", secret, mailer),
    code = inbox.get(c.challengeId)!;
  const wrong = (code[0] === "0" ? "1" : "0") + code.slice(1);
  for (let i = 0; i < 5; i++)
    await expect(
      verifyCode(db, g.id, c.challengeId, wrong, secret),
    ).rejects.toMatchObject({ code: "CODE_INVALID" });
  await expect(
    verifyCode(db, g.id, c.challengeId, code, secret),
  ).rejects.toMatchObject({ code: "CODE_INVALID" });
  expect(
    (
      await db.query<{ attempts: number }>(
        "SELECT attempts FROM app_private.auth_challenges WHERE id=$1",
        [c.challengeId],
      )
    ).rows[0].attempts,
  ).toBe(5);
});
it("delivery failure cannot create a usable challenge or a verified account", async () => {
  const g = await guest();
  await expect(
    requestCode(db, g.id, "fail@example.test", secret, {
      send: async () => {
        throw Error("unavailable");
      },
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect((await account(db, g.id)).kind).toBe("guest");
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.auth_challenges WHERE principal_id=$1 AND used_at IS NULL",
        [g.id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("requires explicit merge after fresh email proof and retains both active histories", async () => {
  const email = "merge@example.test",
    target = await verified(email),
    source = await guest();
  const otherDeviceToken = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO app_private.sessions(token_hash,principal_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
    [(await import("../lib/domain/identity")).hash(otherDeviceToken), target],
  );
  const one = await start(db, target, "last-slice"),
    two = await start(db, source.id, "last-slice");
  await mutate(db, source.id, two.id, "notes", {
    expectedVersion: two.stateVersion,
    text: "Source notes",
  });
  await saveInterests(db, target, ["thriller"], 0);
  await saveInterests(db, source.id, ["cold-case"], 0);
  const c = await requestCode(db, source.id, email, secret, mailer),
    code = inbox.get(c.challengeId)!;
  await expect(
    verifyCode(db, source.id, c.challengeId, code, secret),
  ).rejects.toMatchObject({ code: "MERGE_CONFIRMATION_REQUIRED" });
  expect((await read(db, source.id, two.id)).notes).toBe("Source notes");
  const result = await verifyCode(
    db,
    source.id,
    c.challengeId,
    code,
    secret,
    true,
  );
  expect(await identity(db, result.token)).toBe(target);
  expect(await identity(db, otherDeviceToken)).toBe(target);
  expect(await identity(db, source.token)).toBeNull();
  expect((await read(db, target, one.id)).state).toBe("investigating");
  expect((await read(db, target, two.id)).state).toBe("abandoned");
  expect((await read(db, target, two.id)).notes).toBe("Source notes");
  expect((await interests(db, target)).themes).toEqual([
    "thriller",
    "cold-case",
  ]);
  await expect(read(db, source.id, two.id)).rejects.toMatchObject({
    status: 401,
  });
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.audit_events WHERE action='guest_progress_merged' AND actor_id=$1",
        [target],
      )
    ).rows,
  ).toHaveLength(1);
});
it("defers cross-account merge during active groups, preserves membership after leaving", async () => {
  const email = "roommerge@example.test",
    target = await verified(email),
    source = await guest(),
    r = await createRoom(db, source.id, "missing-mic", "Source");
  const c = await requestCode(db, source.id, email, secret, mailer),
    code = inbox.get(c.challengeId)!;
  await expect(
    verifyCode(db, source.id, c.challengeId, code, secret, true),
  ).rejects.toMatchObject({ code: "ACTIVE_ROOM" });
  await roomAction(db, source.id, r.room.id, "leave", {
    expectedVersion: r.room.stateVersion,
  });
  await verifyCode(db, source.id, c.challengeId, code, secret, true);
  expect(
    (
      await db.query<{ principal_id: string }>(
        "SELECT principal_id FROM app_private.room_members WHERE room_id=$1",
        [r.room.id],
      )
    ).rows[0].principal_id,
  ).toBe(target);
});
it("sign-out revokes only the current token and mocks fail closed for deployed origins", async () => {
  const g = await guest();
  await signOut(db, g.token);
  expect(await identity(db, g.token)).toBeNull();
  expect(
    localAdaptersAllowed({
      NODE_ENV: "production",
      APP_MODE: "test",
      APP_URL: "https://example.com",
      DATABASE_URL: "postgres://db.internal/test",
    }),
  ).toBe(false);
  expect(
    localAdaptersAllowed({
      NODE_ENV: "production",
      APP_MODE: "test",
      APP_URL: "http://127.0.0.1:3000",
      DATABASE_URL: "postgres://127.0.0.1/test",
    }),
  ).toBe(true);
  expect(
    localAdaptersAllowed({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "development",
    }),
  ).toBe(false);
  expect(emailConfig().available).toBe(true);
});
it("rejects guest orders, client amounts, wrong price/mode and inactive deployment inventory", async () => {
  const g = await guest();
  await expect(
    createOrder(db, g.id, quote(), "development", true),
  ).rejects.toMatchObject({ code: "VERIFIED_EMAIL_REQUIRED" });
  expect(orderInput.safeParse({ ...quote(), amountMinor: 1 }).success).toBe(
    false,
  );
  const who = await verified();
  await expect(
    createOrder(
      db,
      who,
      { ...quote(), priceVersionId: quote("group").priceVersionId },
      "development",
      true,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(await products(db)).toEqual([]);
  expect(await products(db, true)).toHaveLength(2);
  await expect(
    createOrder(db, who, quote(), "live", true),
  ).rejects.toMatchObject({ status: 404 });
});
it("creates one server-priced order under retries and rejects idempotency payload changes", async () => {
  const who = await verified(),
    q = quote(),
    r = await Promise.all([
      createOrder(db, who, q, "development", true),
      createOrder(db, who, q, "development", true),
    ]);
  expect(r[0].id).toBe(r[1].id);
  expect(r[0].amountMinor).toBe(200000);
  expect(r[0].currency).toBe("NGN");
  await expect(
    createOrder(db, who, quote("group", q.idempotencyKey), "development", true),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    readOrder(db, (await guest()).id, r[0].id),
  ).rejects.toMatchObject({ status: 404 });
});
it("never fulfils mismatched payment success, currency, environment or amounts", async () => {
  const who = await verified(),
    o = await createOrder(db, who, quote(), "development", true),
    p = await preparePayment(db, who, o.id, "development");
  const good = {
    reference: p.reference,
    transactionId: randomUUID(),
    amountMinor: o.amountMinor,
    currency: o.currency,
    environment: "development" as const,
    success: true,
  };
  for (const bad of [
    { success: false },
    { amountMinor: 1 },
    { currency: "GBP" },
    { environment: "live" as const },
    { amountMinor: 200000.5 },
  ])
    await expect(fulfilPayment(db, { ...good, ...bad })).rejects.toMatchObject({
      code: "PAYMENT_MISMATCH",
    });
  expect(await ownership(db, who)).toEqual([]);
  expect((await readOrder(db, who, o.id)).status).toBe("pending");
});
it("late success fulfils exactly once and ownership remains mode-specific", async () => {
  const who = await verified(),
    o = await createOrder(db, who, quote(), "development", true),
    p = await preparePayment(db, who, o.id, "development");
  await db.query(
    "UPDATE app_private.orders SET expires_at=now()-interval '1 day' WHERE id=$1",
    [o.id],
  );
  expect((await readOrder(db, who, o.id)).status).toBe("expired");
  const payment = {
    reference: p.reference,
    transactionId: randomUUID(),
    amountMinor: o.amountMinor,
    currency: o.currency,
    environment: "development" as const,
    success: true,
  };
  const r = await Promise.all([
    fulfilPayment(db, payment),
    fulfilPayment(db, payment),
  ]);
  expect(r[0]).toEqual(r[1]);
  expect((await readOrder(db, who, o.id)).status).toBe("paid");
  expect(await ownership(db, who)).toEqual([
    { productId: "wedding-gift-solo", mode: "solo", state: "active" },
  ]);
  await expect(
    createOrder(db, who, quote(), "development", true),
  ).rejects.toMatchObject({ code: "ALREADY_OWNED" });
  expect(
    (await createOrder(db, who, quote("group"), "development", true)).mode,
  ).toBe("group");
});
it("does not reuse one provider transaction across two orders", async () => {
  const who = await verified(),
    a = await createOrder(db, who, quote(), "development", true),
    b = await createOrder(db, who, quote("group"), "development", true),
    p = await preparePayment(db, who, a.id, "development"),
    q = await preparePayment(db, who, b.id, "development"),
    tx = randomUUID();
  await fulfilPayment(db, {
    reference: p.reference,
    transactionId: tx,
    amountMinor: a.amountMinor,
    currency: a.currency,
    environment: "development",
    success: true,
  });
  await expect(
    fulfilPayment(db, {
      reference: q.reference,
      transactionId: tx,
      amountMinor: b.amountMinor,
      currency: b.currency,
      environment: "development",
      success: true,
    }),
  ).rejects.toMatchObject({ code: "TRANSACTION_CONFLICT" });
  expect((await readOrder(db, who, b.id)).status).toBe("pending");
});

it("production configuration exposes no development email code or payment provider", async () => {
  try {
    for (const [key, value] of Object.entries({
      NODE_ENV: "production",
      APP_MODE: "production",
      APP_URL: "https://plotrush.example",
      DATABASE_URL: "postgres://private.internal/db",
      FEATURE_EMAIL_AUTH: "false",
      RESEND_API_KEY: "replace_me",
    }))
      vi.stubEnv(key, value);
    expect(emailConfig()).toEqual({ available: false, development: false });
    const { developmentPayment } = await import("../lib/providers/payments");
    expect(() => developmentPayment("forged", 200000, "NGN")).toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});
