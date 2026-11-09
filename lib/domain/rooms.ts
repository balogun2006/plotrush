import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { Database, Sql } from "../db/types";
import { Case, caseSchema } from "./content";
import { assert } from "./errors";
import { hash, lockPrincipal } from "./identity";

export const displayName = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[\p{L}\p{N} ._'’-]+$/u);
export const inviteCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-F0-9]{12}$/);
type Phase =
  | "lobby"
  | "briefing"
  | "investigating"
  | "voting"
  | "revealed"
  | "expired"
  | "cancelled";
type Vote = { suspectId: string; reasonId: string };
type RoomState = {
  phase: Phase;
  round: number;
  deadline: number | null;
  host: string;
  assignments: Record<string, string>;
  shared: string[];
  votes: Record<string, Vote>;
  pausedAt: number | null;
  result: null | {
    suspectId: string | null;
    reasonId: string | null;
    score: number;
    solved: boolean;
    answer: Case["answer"];
    abstentions: number;
  };
};
type Member = {
  principal_id: string;
  nickname: string;
  seat: number;
  ready: boolean;
  departed: boolean;
  last_seen_at: string;
  joined_at: string;
};
type Room = {
  id: string;
  state_version: number;
  state: RoomState;
  content: Case;
  expires_at: string;
  clock: string;
};
const active = (members: Member[]) => members.filter((m) => !m.departed);
const seen = (m: Member) => new Date(m.last_seen_at).getTime();
const connected = (members: Member[], now: number) =>
  active(members).filter((m) => now - seen(m) < 90000);
const terminal = (s: RoomState) =>
  ["revealed", "expired", "cancelled"].includes(s.phase);
async function lock(tx: Sql, id: string) {
  const r = (
    await tx.query<Room>(
      "SELECT r.*,v.content,clock_timestamp() AS clock FROM app_private.rooms r JOIN app_private.case_versions v ON v.id=r.case_version_id WHERE r.id=$1 FOR UPDATE OF r",
      [id],
    )
  ).rows[0];
  assert(r, 404, "NOT_FOUND", "Room unavailable.");
  r.content = caseSchema.parse(r.content);
  return r;
}
async function members(tx: Sql, id: string) {
  return (
    await tx.query<Member>(
      "SELECT * FROM app_private.room_members WHERE room_id=$1 ORDER BY joined_at,seat,principal_id",
      [id],
    )
  ).rows;
}
async function persist(tx: Sql, r: Room, ms: Member[]) {
  await tx.query(
    "UPDATE app_private.rooms SET state=$2,state_version=state_version+1 WHERE id=$1",
    [r.id, JSON.stringify(r.state)],
  );
  r.state_version++;
  for (const m of ms)
    await tx.query(
      "UPDATE app_private.room_members SET ready=$3,departed=$4,last_seen_at=$5 WHERE room_id=$1 AND principal_id=$2",
      [r.id, m.principal_id, m.ready, m.departed, m.last_seen_at],
    );
}
function next(r: Room, ms: Member[], from: number) {
  const s = r.state;
  if (s.phase === "briefing") {
    s.phase = "investigating";
    s.round = 1;
    s.deadline = from + 300000;
  } else if (s.phase === "investigating" && s.round < r.content.rounds.length) {
    s.round++;
    s.deadline = from + 300000;
  } else if (s.phase === "investigating") {
    s.phase = "voting";
    s.deadline = from + 180000;
  }
  for (const m of ms) m.ready = false;
}
function winner(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return !ranked.length || ranked[0][1] === ranked[1]?.[1]
    ? null
    : ranked[0][0];
}
function reveal(r: Room, ms: Member[]) {
  const s = r.state,
    votes = Object.values(s.votes);
  const suspectId = winner(votes.map((v) => v.suspectId));
  const reasonId = suspectId
    ? winner(
        votes.filter((v) => v.suspectId === suspectId).map((v) => v.reasonId),
      )
    : null;
  const score =
    (suspectId === r.content.answer.suspectId ? 60 : 0) +
    (reasonId === r.content.answer.reasonId ? 40 : 0);
  s.result = {
    suspectId,
    reasonId,
    score,
    solved: score === 100,
    answer: r.content.answer,
    abstentions: ms.filter((m) => !s.votes[m.principal_id]).length,
  };
  s.phase = "revealed";
  s.deadline = null;
  s.pausedAt = null;
}
// All time and catch-up decisions occur under the room lock, using the database clock.
function advanceDue(r: Room, ms: Member[], now: number) {
  const s = r.state;
  if (terminal(s)) return;
  if (now >= new Date(r.expires_at).getTime()) {
    s.phase = "expired";
    s.deadline = null;
    return;
  }
  const online = connected(ms, now);
  if (!online.some((m) => m.principal_id === s.host) && online.length)
    s.host = online[0].principal_id;
  if (s.phase === "lobby") return;
  // Detect an overdue pause at the moment the second-last member went stale,
  // rather than advancing all deadlines after a long period without requests.
  if (!s.pausedAt && online.length < 2) {
    const times = active(ms)
      .map((m) => seen(m) + 90000)
      .sort((a, b) => b - a);
    s.pausedAt = Math.min(now, times[1] ?? now);
  }
  if (s.pausedAt !== null) {
    if (now - s.pausedAt >= 300000) {
      s.phase = "expired";
      s.deadline = null;
      return;
    }
    if (online.length < 2) return;
    if (s.deadline) s.deadline += now - s.pausedAt;
    s.pausedAt = null;
  }
  while (s.deadline && now >= s.deadline && !terminal(s)) {
    if (s.phase === "voting") reveal(r, ms);
    else next(r, ms, s.deadline);
  }
  if (s.phase === "investigating" || s.phase === "voting") {
    for (const clue of r.content.rounds
      .filter((x) => x.number <= s.round)
      .flatMap((x) => x.clues)) {
      const owner = ms.find((m) => m.principal_id === s.assignments[clue.id]);
      if (
        owner &&
        (owner.departed || now - seen(owner) >= 90000) &&
        !s.shared.includes(clue.id)
      )
        s.shared.push(clue.id);
    }
  }
  if (s.phase === "voting" && active(ms).every((m) => s.votes[m.principal_id]))
    reveal(r, ms);
}
function project(r: Room, ms: Member[], actor: string) {
  const s = r.state,
    c = r.content,
    me = ms.find((m) => m.principal_id === actor)!;
  const clues = ["investigating", "voting", "revealed"].includes(s.phase)
    ? c.rounds.filter((x) => x.number <= s.round).flatMap((x) => x.clues)
    : [];
  return {
    id: r.id,
    title: c.title,
    briefing: c.briefing,
    phase: s.phase,
    round: s.round,
    totalRounds: c.rounds.length,
    stateVersion: r.state_version,
    serverTime: r.clock,
    deadline: s.deadline,
    paused: s.pausedAt !== null,
    isHost: s.host === actor,
    seat: me.seat,
    minPlayers: c.minPlayers,
    maxPlayers: c.maxPlayers,
    members: ms.map((m) => ({
      seat: m.seat,
      name: m.nickname,
      ready: m.ready,
      departed: m.departed,
      isHost: m.principal_id === s.host,
      isYou: m.principal_id === actor,
      away: new Date(r.clock).getTime() - seen(m) >= 60000,
    })),
    privateClues: clues.filter((x) => s.assignments[x.id] === actor),
    sharedClues: clues.filter((x) => s.shared.includes(x.id)),
    suspects: c.suspects,
    reasons: c.reasons,
    ownVote: s.votes[actor] ?? null,
    result: s.result,
  };
}
export type RoomSnapshot = ReturnType<typeof project>;
export async function createRoom(
  db: Database,
  actor: string,
  key: string,
  name: string,
) {
  name = displayName.parse(name);
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const v = (
      await tx.query<{ id: string; content: Case }>(
        "SELECT id,content FROM app_private.playable_versions WHERE case_key=$1 ORDER BY created_at DESC,id LIMIT 1",
        [key],
      )
    ).rows[0];
    assert(v, 404, "NOT_FOUND", "Case unavailable.");
    const c = caseSchema.parse(v.content);
    assert(
      c.access === "free" && c.kind === "tutorial" && c.modes.includes("group"),
      403,
      "CASE_UNAVAILABLE",
      "Only the free group tutorial is available in this preview.",
    );
    const id = randomUUID(),
      code = randomBytes(6).toString("hex").toUpperCase();
    const state: RoomState = {
      phase: "lobby",
      round: 0,
      deadline: null,
      host: actor,
      assignments: {},
      shared: [],
      votes: {},
      pausedAt: null,
      result: null,
    };
    await tx.query(
      "INSERT INTO app_private.rooms(id,host_id,case_version_id,invite_hash,state) VALUES($1,$2,$3,$4,$5)",
      [id, actor, v.id, hash(code), JSON.stringify(state)],
    );
    await tx.query(
      "INSERT INTO app_private.room_members(room_id,principal_id,nickname,seat) VALUES($1,$2,$3,0)",
      [id, actor, name],
    );
    return {
      room: project(await lock(tx, id), await members(tx, id), actor),
      inviteCode: code,
    };
  });
}
export async function joinRoom(
  db: Database,
  actor: string,
  code: string,
  name: string,
) {
  code = inviteCode.parse(code);
  name = displayName.parse(name);
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const found = (
      await tx.query<{ id: string }>(
        "SELECT id FROM app_private.rooms WHERE invite_hash=$1",
        [hash(code)],
      )
    ).rows[0];
    assert(found, 404, "NOT_FOUND", "Room code not found.");
    const r = await lock(tx, found.id),
      ms = await members(tx, r.id),
      now = new Date(r.clock).getTime();
    advanceDue(r, ms, now);
    const existing = ms.find((m) => m.principal_id === actor);
    if (existing && !existing.departed) {
      await persist(tx, r, ms);
      return project(r, ms, actor);
    }
    assert(
      r.state.phase === "lobby",
      422,
      "ROOM_STARTED",
      "This room is no longer accepting players.",
    );
    const current = active(ms);
    assert(
      current.length < r.content.maxPlayers,
      409,
      "ROOM_FULL",
      "This room is full.",
    );
    assert(
      !current.some((m) => m.nickname.toLowerCase() === name.toLowerCase()),
      409,
      "NAME_USED",
      "Choose a different display name.",
    );
    const seat = Array.from({ length: r.content.maxPlayers }, (_, i) => i).find(
      (n) => !current.some((m) => m.seat === n),
    )!;
    await tx.query(
      "INSERT INTO app_private.room_members(room_id,principal_id,nickname,seat) VALUES($1,$2,$3,$4) ON CONFLICT(room_id,principal_id) DO UPDATE SET nickname=$3,seat=$4,departed=false,ready=false,last_seen_at=now(),joined_at=now()",
      [r.id, actor, name, seat],
    );
    await persist(
      tx,
      r,
      ms.filter((m) => m.principal_id !== actor),
    );
    return project(r, await members(tx, r.id), actor);
  });
}
export type RoomCommand = {
  expectedVersion: number;
  ready?: boolean;
  clueId?: string;
  suspectId?: string;
  reasonId?: string;
};
export async function roomAction(
  db: Database,
  actor: string,
  id: string,
  action = "read",
  input?: RoomCommand,
) {
  return db
    .transaction(async (tx) => {
      await lockPrincipal(tx, actor);
      const r = await lock(tx, id),
        ms = await members(tx, id),
        me = ms.find((m) => m.principal_id === actor && !m.departed);
      assert(me, 404, "NOT_FOUND", "Room not found for this browser.");
      const now = new Date(r.clock).getTime(),
        before = JSON.stringify(r.state);
      advanceDue(r, ms, now);
      // Persist deadline transitions even when the following command is stale.
      // Return an error outside this transaction after committing the catch-up.
      const fail = (status: number, code: string, message: string) =>
        ({ failure: { status, code, message } }) as const;
      if (action !== "read" && action !== "heartbeat") {
        if (
          action === "vote" &&
          (r.state.votes[actor] || r.state.phase === "revealed")
        ) {
          if (before !== JSON.stringify(r.state)) await persist(tx, r, ms);
          return { snapshot: project(r, ms, actor) };
        }
        if (
          input?.expectedVersion !== r.state_version ||
          before !== JSON.stringify(r.state)
        ) {
          if (before !== JSON.stringify(r.state)) await persist(tx, r, ms);
          return fail(
            409,
            "STALE_STATE",
            "The room changed. Review it and try again.",
          );
        }
        if (terminal(r.state))
          return fail(422, "READ_ONLY", "This room has ended.");
      }
      const s = r.state;
      if (action === "heartbeat" && !terminal(s)) {
        me.last_seen_at = r.clock;
        advanceDue(r, ms, now);
      } else if (action === "ready") {
        assert(
          s.phase === "lobby" || s.phase === "investigating",
          422,
          "PHASE_INVALID",
          "You cannot ready up now.",
        );
        me.ready = !!input?.ready;
      } else if (action === "start") {
        assert(
          s.host === actor,
          403,
          "HOST_REQUIRED",
          "Only the acting host can start.",
        );
        const roster = active(ms).sort((a, b) => a.seat - b.seat);
        assert(
          s.phase === "lobby" &&
            roster.length >= r.content.minPlayers &&
            roster.every((m) => m.ready && now - seen(m) < 60000),
          422,
          "NOT_READY",
          "All players must be present and ready.",
        );
        for (const round of r.content.rounds)
          round.clues.forEach((clue, i) => {
            s.assignments[clue.id] = roster[i % roster.length].principal_id;
          });
        s.phase = "briefing";
        s.deadline = now + 60000;
        for (const m of ms) m.ready = false;
      } else if (action === "advance") {
        assert(
          !s.pausedAt,
          422,
          "PAUSED",
          "Wait for another player to return.",
        );
        assert(
          s.host === actor,
          403,
          "HOST_REQUIRED",
          "Only the acting host can advance.",
        );
        assert(
          s.phase === "briefing" || s.phase === "investigating",
          422,
          "PHASE_INVALID",
          "This phase cannot advance.",
        );
        assert(
          s.phase === "briefing" || connected(ms, now).every((m) => m.ready),
          422,
          "NOT_READY",
          "All connected players must be ready to continue.",
        );
        next(r, ms, now);
        advanceDue(r, ms, now);
      } else if (action === "share") {
        const clue = r.content.rounds
          .filter((x) => x.number <= s.round)
          .flatMap((x) => x.clues)
          .find((x) => x.id === input?.clueId);
        assert(
          ["investigating", "voting"].includes(s.phase) &&
            clue &&
            s.assignments[clue.id] === actor,
          404,
          "CLUE_UNAVAILABLE",
          "Only your unlocked evidence can be shared.",
        );
        if (!s.shared.includes(clue.id)) s.shared.push(clue.id);
      } else if (action === "vote") {
        assert(
          s.phase === "voting" && !s.pausedAt,
          422,
          "VOTING_CLOSED",
          "Voting is not open.",
        );
        assert(
          r.content.suspects.some((x) => x.id === input?.suspectId) &&
            r.content.reasons.some((x) => x.id === input?.reasonId),
          400,
          "CHOICE_INVALID",
          "Choose a valid suspect and reason.",
        );
        s.votes[actor] = {
          suspectId: input!.suspectId!,
          reasonId: input!.reasonId!,
        };
        advanceDue(r, ms, now);
      } else if (action === "leave") {
        me.departed = true;
        me.ready = false;
        if (!active(ms).length) {
          s.phase = "cancelled";
          s.deadline = null;
        } else advanceDue(r, ms, now);
      } else
        assert(
          action === "read" || action === "heartbeat",
          404,
          "NOT_FOUND",
          "Unknown room action.",
        );
      if (
        (action !== "read" && action !== "heartbeat") ||
        before !== JSON.stringify(s)
      )
        await persist(tx, r, ms);
      else if (action === "heartbeat")
        await tx.query(
          "UPDATE app_private.room_members SET last_seen_at=$3 WHERE room_id=$1 AND principal_id=$2",
          [id, actor, r.clock],
        );
      return { snapshot: project(r, ms, actor) };
    })
    .then((result) => {
      if ("failure" in result) {
        const f = result.failure;
        assert(false, f.status, f.code, f.message);
      }
      return result.snapshot;
    });
}
export async function roomLibrary(db: Sql, actor: string) {
  return (
    await db.query<{ id: string; title: string; phase: Phase }>(
      "SELECT r.id,v.content->>'title' AS title,r.state->>'phase' AS phase FROM app_private.rooms r JOIN app_private.room_members m ON m.room_id=r.id JOIN app_private.case_versions v ON v.id=r.case_version_id WHERE m.principal_id=$1 AND NOT m.departed ORDER BY r.created_at DESC LIMIT 20",
      [actor],
    )
  ).rows;
}
