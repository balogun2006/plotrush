import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity } from "../lib/domain/identity";
import {
  createOrder,
  fulfilPayment,
  preparePayment,
} from "../lib/domain/commerce";
import { start, read, mutate } from "../lib/domain/game";
import {
  createRoom,
  joinRoom,
  roomAction,
  type RoomCommand,
} from "../lib/domain/rooms";
import {
  playableVersion,
  premiumLibrary,
  type PlayMode,
} from "../lib/domain/premium";

const caseId = "wedding-gift";
const sandbox = { environment: "test", allowFixture: true } as const;
let db: Database;

beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());

async function buyer() {
  const { id } = await createIdentity(db);
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [id, randomUUID() + "@example.test"],
  );
  return id;
}

async function purchase(actor: string, mode: PlayMode) {
  const order = await createOrder(
    db,
    actor,
    {
      productId: caseId + "-" + mode,
      priceVersionId: "demo-wedding-" + mode + "-ngn-v1",
      idempotencyKey: randomUUID(),
    },
    "test",
    false,
    true,
    sandbox,
  );
  const payment = await preparePayment(db, actor, order.id, "paystack");
  return () =>
    fulfilPayment(db, {
      reference: payment.reference,
      transactionId: randomUUID(),
      amountMinor: order.amountMinor,
      currency: order.currency,
      environment: "test",
      success: true,
    });
}

it("requires verified, environment-matched ownership for each mode and respects withdrawn access", async () => {
  const owner = await buyer();
  const settle = await purchase(owner, "solo");
  await expect(start(db, owner, caseId, sandbox)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  await settle();
  const first = await start(db, owner, caseId, sandbox);
  expect(first.access).toBe("paid");
  expect(first.rounds).toHaveLength(1);
  expect(first.result).toBeNull();
  expect((await start(db, owner, caseId, sandbox)).id).toBe(first.id);
  await expect(start(db, owner, caseId)).rejects.toMatchObject({
    code: "CASE_UNAVAILABLE",
  });
  await expect(
    start(db, owner, caseId, { ...sandbox, allowFixture: false }),
  ).rejects.toMatchObject({ code: "CASE_UNAVAILABLE" });
  await expect(
    start(db, owner, caseId, { ...sandbox, environment: "development" }),
  ).rejects.toMatchObject({ code: "PURCHASE_REQUIRED" });
  await expect(
    createRoom(db, owner, caseId, "Solo buyer", sandbox),
  ).rejects.toMatchObject({ code: "PURCHASE_REQUIRED" });
  const guest = (await createIdentity(db)).id;
  await expect(read(db, guest, first.id)).rejects.toMatchObject({
    status: 404,
  });
  expect(await premiumLibrary(db, guest, sandbox)).toEqual([]);
  expect(await premiumLibrary(db, owner, sandbox)).toEqual([
    { caseId, mode: "solo", title: first.title },
  ]);
  await db.query(
    "UPDATE app_private.entitlements SET state='revoked' WHERE owner_id=$1",
    [owner],
  );
  await expect(start(db, owner, caseId, sandbox)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  expect(await premiumLibrary(db, owner, sandbox)).toEqual([]);
  expect((await read(db, owner, first.id)).id).toBe(first.id);
});

it("lets a verified solo purchase complete every premium round before revealing its solution", async () => {
  const owner = await buyer();
  await (
    await purchase(owner, "solo")
  )();
  let game = await start(db, owner, caseId, sandbox);
  const source = (await playableVersion(db, caseId)).content;
  expect(game.totalRounds).toBe(3);
  await expect(
    mutate(db, owner, game.id, "accusation", {
      expectedVersion: game.stateVersion,
      suspectId: source.answer.suspectId,
      reasonId: source.answer.reasonId,
    }),
  ).rejects.toMatchObject({ code: "ROUND_LOCKED" });
  for (let round = 2; round <= game.totalRounds; round++) {
    game = await mutate(db, owner, game.id, "advance", {
      expectedVersion: game.stateVersion,
    });
    expect(game.rounds).toHaveLength(round);
    expect(game.result).toBeNull();
  }
  const result = await mutate(db, owner, game.id, "accusation", {
    expectedVersion: game.stateVersion,
    suspectId: source.answer.suspectId,
    reasonId: source.answer.reasonId,
  });
  expect(result.result?.score).toBe(100);
  expect((await read(db, owner, game.id)).result).toEqual(result.result);
});

it("admits five unpaid guests, starts with four ready players and rechecks the payer at start", async () => {
  const host = await buyer();
  await (
    await purchase(host, "group")
  )();
  const created = await createRoom(db, host, caseId, "Host", sandbox);
  const id = created.room.id;
  const guests = await Promise.all(
    Array.from({ length: 6 }, () => createIdentity(db)),
  );
  const command = async (
    actor: string,
    action: string,
    fields: Partial<RoomCommand> = {},
  ) => {
    const snapshot = await roomAction(db, actor, id);
    return roomAction(
      db,
      actor,
      id,
      action,
      { expectedVersion: snapshot.stateVersion, ...fields },
      sandbox,
    );
  };
  expect(created.room.minPlayers).toBe(4);
  expect(created.room.access).toBe("paid");
  await expect(start(db, host, caseId, sandbox)).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  await expect(
    createRoom(db, guests[0].id, caseId, "Guest", sandbox),
  ).rejects.toMatchObject({ code: "PURCHASE_REQUIRED" });
  await command(host, "ready", { ready: true });
  for (let i = 0; i < 2; i++) {
    await joinRoom(db, guests[i].id, created.inviteCode, "Guest " + i);
    await command(guests[i].id, "ready", { ready: true });
  }
  await expect(command(host, "start")).rejects.toMatchObject({
    code: "NOT_READY",
  });
  for (let i = 2; i < 5; i++)
    await joinRoom(db, guests[i].id, created.inviteCode, "Guest " + i);
  await expect(
    joinRoom(db, guests[5].id, created.inviteCode, "Seventh"),
  ).rejects.toMatchObject({ code: "ROOM_FULL" });
  await command(guests[3].id, "leave");
  await command(guests[4].id, "leave");
  await command(guests[2].id, "ready", { ready: true });
  await db.query(
    "UPDATE app_private.entitlements SET state='suspended' WHERE owner_id=$1",
    [host],
  );
  await expect(command(host, "start")).rejects.toMatchObject({
    code: "PURCHASE_REQUIRED",
  });
  await db.query(
    "UPDATE app_private.entitlements SET state='active' WHERE owner_id=$1",
    [host],
  );
  expect((await command(host, "start")).phase).toBe("briefing");
  await command(host, "advance");
  const hostView = await roomAction(db, host, id);
  const guestView = await roomAction(db, guests[0].id, id);
  expect(hostView.privateClues.length).toBeGreaterThan(0);
  expect(guestView.privateClues.length).toBeGreaterThan(0);
  expect(
    hostView.privateClues.some((c) =>
      guestView.privateClues.some((g) => g.id === c.id),
    ),
  ).toBe(false);
  expect(hostView.result).toBeNull();
  await db.query(
    "UPDATE app_private.entitlements SET state='revoked' WHERE owner_id=$1",
    [host],
  );
  expect((await roomAction(db, guests[0].id, id)).phase).toBe("investigating");
});
