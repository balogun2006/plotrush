import { beforeAll, afterAll, it, expect } from "vitest";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import { createIdentity, saveInterests } from "../lib/domain/identity";
import { start } from "../lib/domain/game";
import { createRoom, joinRoom, roomAction } from "../lib/domain/rooms";
import { recommendations } from "../lib/domain/recommendations";
import type { Database } from "../lib/db/types";
let db: Database;
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
const query = (s = "") => new URLSearchParams(s);
it("uses honest featured fallback, strict explicit filters and a bounded limit", async () => {
  const result = await recommendations(db, null, query("limit=1"));
  expect(result.label).toBe("Featured mysteries");
  expect(result.cases).toHaveLength(1);
  expect(result.preferenceVersion).toBe(0);
  expect(
    (
      await recommendations(
        db,
        null,
        query("themes=cold-case&mode=solo&access=free"),
      )
    ).cases,
  ).toEqual([]);
  for (const invalid of [
    "limit=11",
    "limit=0",
    "includeCompleted=yes",
    "mode=solo&mode=group",
    "unknown=x",
  ])
    await expect(
      recommendations(db, null, query(invalid)),
    ).rejects.toMatchObject({ status: 400 });
});
it("excludes exposed solo cases only for their owner and separates replay results", async () => {
  const alice = (await createIdentity(db)).id,
    bob = (await createIdentity(db)).id;
  await start(db, alice, "last-slice");
  const result = await recommendations(
    db,
    alice,
    query("includeCompleted=true"),
  );
  expect(result.cases.some((c) => c.id === "last-slice")).toBe(false);
  expect(result.replays.map((c) => c.id)).toEqual(["last-slice"]);
  expect(
    (await recommendations(db, bob, query())).cases.some(
      (c) => c.id === "last-slice",
    ),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /decisiveClueIds|eliminations|principal_id/,
  );
});
it("does not exclude a group lobby, but excludes evidence exposure across modes", async () => {
  const host = (await createIdentity(db)).id,
    guest = (await createIdentity(db)).id;
  const created = await createRoom(db, host, "missing-mic", "Host");
  await joinRoom(db, guest, created.inviteCode, "Guest");
  const params = query("mode=group&includeCompleted=true");
  expect(
    (await recommendations(db, guest, params)).cases.map((c) => c.id),
  ).toContain("missing-mic");
  for (const actor of [host, guest]) {
    const room = await roomAction(db, actor, created.room.id);
    await roomAction(db, actor, room.id, "ready", {
      expectedVersion: room.stateVersion,
      ready: true,
    });
  }
  for (const action of ["start", "advance"]) {
    const room = await roomAction(db, host, created.room.id);
    await roomAction(db, host, room.id, action, {
      expectedVersion: room.stateVersion,
    });
  }
  const result = await recommendations(db, guest, params);
  expect(result.cases).toEqual([]);
  expect(result.replays.map((c) => c.id)).toContain("missing-mic");
});
it("scores any theme overlap once, respects filters, and clears personalisation immediately", async () => {
  const actor = (await createIdentity(db)).id;
  await saveInterests(db, actor, ["everyday-mystery", "wedding-family"], 0);
  const result = await recommendations(db, actor, query("mode=any"));
  expect(result.label).toBe("For you");
  expect(result.cases.every((c) => c.rank === 3)).toBe(true);
  expect(result.cases.every((c) => c.reasonCode === "THEME_MATCH")).toBe(true);
  expect(
    (await recommendations(db, actor, query("themes=thriller"))).cases,
  ).toEqual([]);
  await saveInterests(db, actor, [], 1);
  expect((await recommendations(db, actor, query())).label).toBe(
    "Featured mysteries",
  );
});
