import { beforeAll, afterAll, it, expect } from "vitest";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import { createIdentity } from "../lib/domain/identity";
import {
  createRoom,
  joinRoom,
  roomAction,
  RoomSnapshot,
} from "../lib/domain/rooms";
import type { Database } from "../lib/db/types";
let db: Database;
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
async function actor() {
  return (await createIdentity(db)).id;
}
async function setup(count = 2) {
  const ids = await Promise.all(Array.from({ length: count }, actor));
  const created = await createRoom(db, ids[0], "missing-mic", "Player 0");
  for (let i = 1; i < count; i++)
    await joinRoom(db, ids[i], created.inviteCode, "Player " + i);
  return { ids, id: created.room.id, code: created.inviteCode };
}
async function act(
  id: string,
  who: string,
  action: string,
  data: Record<string, unknown> = {},
) {
  const current = await roomAction(db, who, id);
  return roomAction(db, who, id, action, {
    expectedVersion: current.stateVersion,
    ...data,
  });
}
async function investigating(count = 2) {
  const game = await setup(count);
  for (const who of game.ids) await act(game.id, who, "ready", { ready: true });
  await act(game.id, game.ids[0], "start");
  await act(game.id, game.ids[0], "advance");
  return game;
}
it("gates paid/solo cases and never exposes secrets in a lobby", async () => {
  const who = await actor();
  for (const key of ["wedding-gift", "last-slice"])
    await expect(createRoom(db, who, key, "Host")).rejects.toMatchObject({
      status: 403,
    });
  const { room, inviteCode } = await createRoom(db, who, "missing-mic", "Host");
  expect(inviteCode).toMatch(/^[A-F0-9]{12}$/);
  expect(room.privateClues).toEqual([]);
  expect(JSON.stringify(room)).not.toContain("explanation");
  const stored = await db.query<{ invite_hash: string }>(
    "SELECT invite_hash FROM app_private.rooms WHERE id=$1",
    [room.id],
  );
  expect(stored.rows[0].invite_hash).not.toBe(inviteCode);
});
it("serializes capacity races and rejects name-based seat theft", async () => {
  const g = await setup(5),
    six = await actor(),
    seven = await actor();
  const outcomes = await Promise.allSettled([
    joinRoom(db, six, g.code, "Six"),
    joinRoom(db, seven, g.code, "Seven"),
  ]);
  expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await roomAction(db, g.ids[0], g.id)).members).toHaveLength(6);
  await expect(roomAction(db, await actor(), g.id)).rejects.toMatchObject({
    status: 404,
  });
  const other = await setup();
  await expect(
    joinRoom(db, await actor(), other.code, "Player 0"),
  ).rejects.toMatchObject({ code: "NAME_USED" });
});
it("requires present ready roster and host authority, locks the roster after start", async () => {
  const g = await setup();
  await expect(act(g.id, g.ids[0], "start")).rejects.toMatchObject({
    code: "NOT_READY",
  });
  for (const id of g.ids) await act(g.id, id, "ready", { ready: true });
  await expect(act(g.id, g.ids[1], "start")).rejects.toMatchObject({
    status: 403,
  });
  const r = await act(g.id, g.ids[0], "start");
  expect(r.phase).toBe("briefing");
  expect(r.privateClues).toEqual([]);
  await expect(
    joinRoom(db, await actor(), g.code, "Late"),
  ).rejects.toMatchObject({ code: "ROOM_STARTED" });
  expect(
    (await joinRoom(db, g.ids[0], g.code, "Changed")).members[0].name,
  ).toBe("Player 0");
});
it("distributes all six clues uniquely for 2–6 players and denies sharing another player's clue", async () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const g = await investigating(count),
      snapshots = await Promise.all(
        g.ids.map((id) => roomAction(db, id, g.id)),
      );
    const all = snapshots.flatMap((s) => s.privateClues.map((c) => c.id));
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6);
    expect(snapshots.every((s) => s.privateClues.length >= 1)).toBe(true);
    await expect(
      act(g.id, g.ids[0], "share", { clueId: snapshots[1].privateClues[0].id }),
    ).rejects.toMatchObject({ status: 404 });
    await act(g.id, g.ids[0], "share", {
      clueId: snapshots[0].privateClues[0].id,
    });
    expect((await roomAction(db, g.ids[1], g.id)).sharedClues).toHaveLength(1);
  }
});
it("keeps votes private, immutable and reveals one durable consensus result", async () => {
  const g = await investigating(4);
  for (const id of g.ids) await act(g.id, id, "ready", { ready: true });
  await act(g.id, g.ids[0], "advance");
  const correct = { suspectId: "kunle", reasonId: "serial-photo" };
  await act(g.id, g.ids[0], "vote", correct);
  const other = await roomAction(db, g.ids[1], g.id);
  expect(other.ownVote).toBeNull();
  expect(other.result).toBeNull();
  expect(JSON.stringify(other)).not.toContain('"votes"');
  const retry = await act(g.id, g.ids[0], "vote", {
    suspectId: "bisi",
    reasonId: "loudest",
  });
  expect(retry.ownVote).toEqual(correct);
  for (const id of g.ids.slice(1)) await act(g.id, id, "vote", correct);
  const result = await roomAction(db, g.ids[0], g.id);
  expect(result.result?.score).toBe(100);
  expect(result.phase).toBe("revealed");
  expect(
    (await act(g.id, g.ids[1], "vote", { suspectId: "tomi", reasonId: "van" }))
      .result,
  ).toEqual(result.result);
});
it("ties yield no consensus, including tied reasons", async () => {
  for (const reasonTie of [false, true]) {
    const g = await investigating();
    for (const id of g.ids) await act(g.id, id, "ready", { ready: true });
    await act(g.id, g.ids[0], "advance");
    await act(g.id, g.ids[0], "vote", {
      suspectId: "kunle",
      reasonId: "serial-photo",
    });
    const r = await act(g.id, g.ids[1], "vote", {
      suspectId: reasonTie ? "kunle" : "bisi",
      reasonId: "loudest",
    });
    expect(r.result?.solved).toBe(false);
    expect(r.result?.reasonId).toBeNull();
    expect(r.result?.suspectId).toBe(reasonTie ? "kunle" : null);
  }
});
it("catches up deadlines on reads and abstains missing votes", async () => {
  const g = await investigating();
  await db.query(
    "UPDATE app_private.rooms SET state=jsonb_set(state,'{deadline}',to_jsonb((extract(epoch FROM now())*1000-1000)::bigint)) WHERE id=$1",
    [g.id],
  );
  expect((await roomAction(db, g.ids[0], g.id)).phase).toBe("voting");
  await db.query(
    "UPDATE app_private.rooms SET state=jsonb_set(state,'{deadline}',to_jsonb((extract(epoch FROM now())*1000-1000)::bigint)) WHERE id=$1",
    [g.id],
  );
  const r = await roomAction(db, g.ids[0], g.id);
  expect(r.phase).toBe("revealed");
  expect(r.result?.abstentions).toBe(2);
  expect(r.result?.suspectId).toBeNull();
});
it("promotes unlocked evidence and transfers host after disconnect; original host does not reclaim", async () => {
  const g = await investigating(3),
    host = await roomAction(db, g.ids[0], g.id);
  await db.query(
    "UPDATE app_private.room_members SET last_seen_at=now()-interval '100 seconds' WHERE room_id=$1 AND principal_id=$2",
    [g.id, g.ids[0]],
  );
  const next = await roomAction(db, g.ids[1], g.id);
  expect(next.isHost).toBe(true);
  expect(next.sharedClues.map((c) => c.id)).toEqual(
    host.privateClues.map((c) => c.id),
  );
  const returned = await roomAction(db, g.ids[0], g.id, "heartbeat", {
    expectedVersion: next.stateVersion,
  });
  expect(returned.isHost).toBe(false);
});
it("pauses with one connected player, resumes with two, expires after five minutes", async () => {
  const g = await investigating();
  await db.query(
    "UPDATE app_private.room_members SET last_seen_at=now()-interval '100 seconds' WHERE room_id=$1 AND principal_id=$2",
    [g.id, g.ids[1]],
  );
  const paused = await roomAction(db, g.ids[0], g.id);
  expect(paused.paused).toBe(true);
  const resumed = await roomAction(db, g.ids[1], g.id, "heartbeat", {
    expectedVersion: paused.stateVersion,
  });
  expect(resumed.paused).toBe(false);
  expect(resumed.deadline!).toBeGreaterThan(paused.deadline!);
  await db.query(
    "UPDATE app_private.room_members SET last_seen_at=now()-interval '7 minutes' WHERE room_id=$1",
    [g.id],
  );
  expect((await roomAction(db, g.ids[0], g.id)).phase).toBe("expired");
});
it("rejects stale commands and departed-member reads, permits only lobby rejoin", async () => {
  const g = await setup();
  const old = await roomAction(db, g.ids[0], g.id);
  await act(g.id, g.ids[1], "ready", { ready: true });
  await expect(
    roomAction(db, g.ids[0], g.id, "ready", {
      expectedVersion: old.stateVersion,
      ready: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await act(g.id, g.ids[1], "leave");
  await expect(roomAction(db, g.ids[1], g.id)).rejects.toMatchObject({
    status: 404,
  });
  const back = await joinRoom(db, g.ids[1], g.code, "Returned");
  expect(back.members.find((m) => m.isYou)?.departed).toBe(false);
});
it("heartbeat alone does not invalidate gameplay versions", async () => {
  const g = await investigating();
  let r: RoomSnapshot = await roomAction(db, g.ids[0], g.id);
  const version = r.stateVersion;
  r = await roomAction(db, g.ids[0], g.id, "heartbeat", {
    expectedVersion: version,
  });
  expect(r.stateVersion).toBe(version);
});
it("never promotes future evidence when a member disconnects", async () => {
  const source = (
    await db.query<{ content: import("../lib/domain/content").Case }>(
      "SELECT content FROM app_private.case_versions WHERE case_key='missing-mic' LIMIT 1",
    )
  ).rows[0].content;
  const content = structuredClone(source);
  content.key = "two-round-test";
  content.slug = "two-round-test";
  content.rounds.push({
    ...structuredClone(content.rounds[0]),
    number: 2,
    clues: content.rounds[0].clues.map((c) => ({
      ...c,
      id: "future-" + c.id,
      round: 2,
    })),
    hints: [],
  });
  await db.query(
    "INSERT INTO app_private.case_versions(id,case_key,checksum,content,status) VALUES('two-round-test','two-round-test','test',$1,'draft')",
    [JSON.stringify(content)],
  );
  await db.query(
    "INSERT INTO app_private.preview_fixtures(version_id) VALUES('two-round-test')",
  );
  const ids = await Promise.all([actor(), actor(), actor()]);
  const created = await createRoom(db, ids[0], content.key, "One");
  await joinRoom(db, ids[1], created.inviteCode, "Two");
  await joinRoom(db, ids[2], created.inviteCode, "Three");
  for (const who of ids)
    await act(created.room.id, who, "ready", { ready: true });
  await act(created.room.id, ids[0], "start");
  await act(created.room.id, ids[0], "advance");
  await act(created.room.id, ids[2], "leave");
  let r = await roomAction(db, ids[0], created.room.id);
  expect(r.sharedClues.length).toBe(2);
  expect(JSON.stringify(r)).not.toContain("future-");
  await expect(
    act(created.room.id, ids[0], "share", { clueId: "future-mic-01" }),
  ).rejects.toMatchObject({ status: 404 });
  for (const who of ids.slice(0, 2))
    await act(created.room.id, who, "ready", { ready: true });
  r = await act(created.room.id, ids[0], "advance");
  expect(r.round).toBe(2);
  expect(r.sharedClues.filter((c) => c.id.startsWith("future-"))).toHaveLength(
    2,
  );
});
