import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity } from "../lib/domain/identity";
import { start, read, mutate, soloTranscript } from "../lib/domain/game";
import {
  createRoom,
  joinRoom,
  roomAction,
  privateRoomNotes,
  roomTranscript,
  rehostRoom,
} from "../lib/domain/rooms";
import {
  createOrder,
  preparePayment,
  fulfilPayment,
} from "../lib/domain/commerce";
import { requestCode, verifyCode } from "../lib/domain/accounts";
let db: Database;
const premium = { environment: "test", allowFixture: true } as const;
const actor = async () => (await createIdentity(db)).id;
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
async function buy() {
  const who = await actor();
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [who, randomUUID() + "@example.test"],
  );
  const o = await createOrder(
      db,
      who,
      {
        productId: "wedding-gift-group",
        priceVersionId: "demo-wedding-group-ngn-v1",
        idempotencyKey: randomUUID(),
      },
      "test",
      false,
      true,
      premium,
    ),
    p = await preparePayment(db, who, o.id, "paystack");
  await fulfilPayment(db, {
    reference: p.reference,
    transactionId: randomUUID(),
    amountMinor: o.amountMinor,
    currency: o.currency,
    environment: "test",
    success: true,
  });
  return who;
}
async function cmd(id: string, who: string, action: string, extra = {}) {
  const r = await roomAction(db, who, id);
  return roomAction(
    db,
    who,
    id,
    action,
    { expectedVersion: r.stateVersion, ...extra },
    premium,
  );
}
async function group(n = 2, paid = false) {
  const ids = [
      paid ? await buy() : await actor(),
      ...(await Promise.all(Array.from({ length: n - 1 }, actor))),
    ],
    r = await createRoom(
      db,
      ids[0],
      paid ? "wedding-gift" : "missing-mic",
      "Player 0",
      paid ? premium : undefined,
    );
  for (let i = 1; i < n; i++)
    await joinRoom(db, ids[i], r.inviteCode, "Player " + i);
  return { ids, id: r.room.id, code: r.inviteCode };
}
async function begin(g: Awaited<ReturnType<typeof group>>) {
  for (const who of g.ids) await cmd(g.id, who, "ready", { ready: true });
  await cmd(g.id, g.ids[0], "start");
  return cmd(g.id, g.ids[0], "advance");
}
it("expires solo attempts using database time while preserving notes and replay access", async () => {
  const who = await actor(),
    a = await start(db, who, "last-slice");
  await mutate(db, who, a.id, "notes", {
    expectedVersion: a.stateVersion,
    text: "Preserved expiry note",
  });
  await db.query(
    "UPDATE app_private.attempts SET expires_at=now()-interval '1 second' WHERE id=$1",
    [a.id],
  );
  await expect(
    mutate(db, who, a.id, "advance", { expectedVersion: a.stateVersion }),
  ).rejects.toMatchObject({ code: "READ_ONLY" });
  expect(await read(db, who, a.id)).toMatchObject({
    state: "abandoned",
    terminationReason: "expired",
    notes: "Preserved expiry note",
    result: null,
  });
  expect(await soloTranscript(db, who, a.id)).toContain(
    "Preserved expiry note",
  );
  expect(await soloTranscript(db, who, a.id)).not.toContain(
    "Tunde removed the reserved box",
  );
  expect((await start(db, who, "last-slice")).id).not.toBe(a.id);
  await expect(read(db, await actor(), a.id)).rejects.toMatchObject({
    status: 404,
  });
});
it("abandon keeps daily reservation and cannot change a revealed result", async () => {
  const who = await actor(),
    a = await start(db, who, "last-slice");
  await db.query(
    "UPDATE app_private.attempts SET daily_day=timezone('UTC',now())::date WHERE id=$1",
    [a.id],
  );
  expect(
    (
      await mutate(db, who, a.id, "abandon", {
        expectedVersion: a.stateVersion,
      })
    ).terminationReason,
  ).toBe("abandoned");
  const replay = await start(db, who, "last-slice");
  expect(replay.dailyDay).toBeNull();
  const c = (
    await db.query<{
      content: { answer: { suspectId: string; reasonId: string } };
    }>(
      "SELECT content FROM app_private.case_versions WHERE case_key='last-slice' LIMIT 1",
    )
  ).rows[0].content;
  const done = await mutate(db, who, replay.id, "accusation", {
    expectedVersion: replay.stateVersion,
    suspectId: c.answer.suspectId,
    reasonId: c.answer.reasonId,
  });
  await expect(
    mutate(db, who, replay.id, "abandon", {
      expectedVersion: done.stateVersion,
    }),
  ).rejects.toMatchObject({ code: "READ_ONLY" });
  expect((await read(db, who, replay.id)).result).toEqual(done.result);
  const key = randomUUID(),
    body = {
      expectedVersion: done.stateVersion,
      suspectId: c.answer.suspectId,
      reasonId: c.answer.reasonId,
    };
  await mutate(db, who, replay.id, "accusation", body, key);
  await expect(
    mutate(
      db,
      who,
      replay.id,
      "accusation",
      { ...body, reasonId: "changed" },
      key,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("request receipts prevent duplicate rooms, starts and commands", async () => {
  const who = await actor(),
    key = randomUUID();
  const [a, b] = await Promise.all([
    createRoom(db, who, "missing-mic", "Host", undefined, key),
    createRoom(db, who, "missing-mic", "Host", undefined, key),
  ]);
  expect(a.room.id).toBe(b.room.id);
  expect(a.inviteCode).toBe(b.inviteCode);
  expect(a.room.stateVersion).toBe(b.room.stateVersion);
  await expect(
    createRoom(db, who, "missing-mic", "Other", undefined, key),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const sk = randomUUID(),
    s = await start(db, who, "last-slice", undefined, sk);
  expect((await start(db, who, "last-slice", undefined, sk)).id).toBe(s.id);
  await expect(
    start(db, who, "wrong-parcel", undefined, sk),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const nk = randomUUID(),
    body = { expectedVersion: s.stateVersion, text: "Once" },
    n = await mutate(db, who, s.id, "notes", body, nk);
  expect((await mutate(db, who, s.id, "notes", body, nk)).stateVersion).toBe(
    n.stateVersion,
  );
  await expect(
    mutate(db, who, s.id, "notes", { ...body, text: "Changed" }, nk),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const rk = randomUUID(),
    rbody = { expectedVersion: a.room.stateVersion, ready: true },
    r = await roomAction(db, who, a.room.id, "ready", rbody, undefined, rk);
  expect(
    (await roomAction(db, who, a.room.id, "ready", rbody, undefined, rk))
      .stateVersion,
  ).toBe(r.stateVersion);
});
it("private room notes have independent revisions and no shared notifications", async () => {
  const g = await group(),
    before = await roomAction(db, g.ids[0], g.id),
    count = (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM app_private.room_events WHERE room_id=$1",
        [g.id],
      )
    ).rows[0].n;
  const writes = await Promise.allSettled([
    privateRoomNotes(db, g.ids[1], g.id, {
      text: "Guest private draft",
      expectedNotesVersion: 0,
    }),
    privateRoomNotes(db, g.ids[1], g.id, {
      text: "Competing draft",
      expectedNotesVersion: 0,
    }),
  ]);
  expect(writes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await privateRoomNotes(db, g.ids[0], g.id)).notes).toBe("");
  await expect(privateRoomNotes(db, await actor(), g.id)).rejects.toMatchObject(
    { status: 404 },
  );
  expect((await roomAction(db, g.ids[0], g.id)).stateVersion).toBe(
    before.stateVersion,
  );
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM app_private.room_events WHERE room_id=$1",
        [g.id],
      )
    ).rows[0].n,
  ).toBe(count);
  expect(await roomTranscript(db, g.ids[0], g.id)).not.toMatch(
    /Guest private|Competing draft/,
  );
});
it("independent solo note versions reject concurrent overwrites", async () => {
  const who = await actor(),
    a = await start(db, who, "last-slice"),
    r = await Promise.allSettled([
      mutate(db, who, a.id, "notes", {
        expectedVersion: 0,
        expectedNotesVersion: 0,
        text: "A",
      }),
      mutate(db, who, a.id, "notes", {
        expectedVersion: 0,
        expectedNotesVersion: 0,
        text: "B",
      }),
    ]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await read(db, who, a.id)).notesVersion).toBe(1);
});
it("paid resume preserves the frozen room and requires its owner and returning players", async () => {
  const g = await group(6, true),
    first = await begin(g),
    guest = await roomAction(db, g.ids[1], g.id);
  expect(first.privateClues).toHaveLength(1);
  expect(await roomTranscript(db, g.ids[0], g.id)).not.toContain(
    guest.privateClues[0].body,
  );
  await db.query(
    "UPDATE app_private.rooms SET state=jsonb_set(state,'{pausedAt}',to_jsonb((extract(epoch FROM now())*1000-400000)::bigint)) WHERE id=$1",
    [g.id],
  );
  expect((await roomAction(db, g.ids[0], g.id)).phase).toBe("expired");
  await roomAction(db, g.ids[0], g.id, "heartbeat");
  await roomAction(db, g.ids[1], g.id, "heartbeat");
  await expect(cmd(g.id, g.ids[1], "resume")).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  const resumed = await cmd(g.id, g.ids[0], "resume");
  expect(resumed).toMatchObject({ phase: "investigating", round: 1 });
  expect(resumed.privateClues).toEqual(first.privateClues);
});
it("rehost makes one linked replacement and rechecks owner access", async () => {
  const g = await group(4, true);
  await begin(g);
  await db.query(
    "UPDATE app_private.rooms SET expires_at=now()-interval '1 second' WHERE id=$1",
    [g.id],
  );
  await roomAction(db, g.ids[0], g.id);
  await expect(rehostRoom(db, g.ids[1], g.id, premium)).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  const [a, b] = await Promise.all([
    rehostRoom(db, g.ids[0], g.id, premium),
    rehostRoom(db, g.ids[0], g.id, premium),
  ]);
  expect(a.room.id).toBe(b.room.id);
  expect(a.inviteCode).toBe(b.inviteCode);
  expect(a.room.id).not.toBe(g.id);
  await db.query(
    "UPDATE app_private.rooms SET expires_at=now()-interval '1 second' WHERE id=$1",
    [a.room.id],
  );
  await roomAction(db, g.ids[0], a.room.id);
  await db.query(
    "UPDATE app_private.entitlements SET state='revoked' WHERE owner_id=$1",
    [g.ids[0]],
  );
  await expect(
    rehostRoom(db, g.ids[0], a.room.id, premium),
  ).rejects.toMatchObject({ code: "PURCHASE_REQUIRED" });
});
it("repeat migration preserves frozen versions and outboxes contain no private payloads", async () => {
  const who = await actor(),
    a = await start(db, who, "last-slice"),
    before = await read(db, who, a.id);
  await migrate(db);
  expect(await read(db, who, a.id)).toEqual(before);
  expect(
    JSON.stringify(
      (await db.query("SELECT * FROM app_private.room_events LIMIT 20")).rows,
    ),
  ).not.toMatch(/clue|suspect|answer|nickname|notes|vote/);
});
it("six paid players complete all three rounds without guest purchases", async () => {
  const g = await group(6, true);
  let r = await begin(g);
  for (let round = 1; round <= 3; round++) {
    expect(r.round).toBe(round);
    expect(
      (await Promise.all(g.ids.map((w) => roomAction(db, w, g.id)))).every(
        (v) => v.privateClues.length === round,
      ),
    ).toBe(true);
    for (const who of g.ids) await cmd(g.id, who, "ready", { ready: true });
    r = await cmd(g.id, g.ids[0], "advance");
  }
  expect(r.phase).toBe("voting");
  const c = (
    await db.query<{
      content: { answer: { suspectId: string; reasonId: string } };
    }>(
      "SELECT content FROM app_private.case_versions WHERE case_key='wedding-gift' LIMIT 1",
    )
  ).rows[0].content;
  for (const who of g.ids)
    r = await cmd(g.id, who, "vote", {
      suspectId: c.answer.suspectId,
      reasonId: c.answer.reasonId,
    });
  expect(r.result).toMatchObject({ solved: true, score: 100, abstentions: 0 });
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM app_private.orders WHERE buyer_id=ANY($1::uuid[])",
        [g.ids.slice(1)],
      )
    ).rows[0].n,
  ).toBe(0);
});
it("account merge retains both conflicting private room drafts", async () => {
  const guest = await createIdentity(db),
    account = await createIdentity(db),
    email = randomUUID() + "@example.test";
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [account.id, email],
  );
  const room = await createRoom(db, guest.id, "missing-mic", "Guest owner");
  await joinRoom(db, account.id, room.inviteCode, "Account member");
  await privateRoomNotes(db, guest.id, room.room.id, {
    text: "Guest draft retained",
    expectedNotesVersion: 0,
  });
  await privateRoomNotes(db, account.id, room.room.id, {
    text: "Account draft wins",
    expectedNotesVersion: 0,
  });
  await db.query(
    "UPDATE app_private.rooms SET state=jsonb_set(state,'{phase}','\"cancelled\"'::jsonb) WHERE id=$1",
    [room.room.id],
  );
  const secret = "synthetic-merge-secret-with-32characters";
  let code = "";
  const challenge = await requestCode(db, guest.id, email, secret, {
    send: async (m) => {
      code = m.code;
    },
  });
  await verifyCode(db, guest.id, challenge.challengeId, code, secret, true);
  const n = await privateRoomNotes(db, account.id, room.room.id);
  expect(n.notes).toBe("Account draft wins");
  expect(n.archivedNotes.map((a) => a.notes)).toContain("Guest draft retained");
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.room_notes WHERE principal_id=$1",
        [guest.id],
      )
    ).rows,
  ).toEqual([]);
});
