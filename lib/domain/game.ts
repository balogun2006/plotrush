import { randomUUID } from "node:crypto";
import { Database, Sql } from "../db/types";
import { Case, caseSchema, card } from "./content";
import { assert } from "./errors";
import { playableVersion, requirePremium, type PremiumPolicy } from "./premium";
import { lockPrincipal } from "./identity";
import { dailyClock, scheduledCase } from "./daily";
type Attempt = {
  id: string;
  principal_id: string;
  case_version_id: string;
  state: "investigating" | "revealed" | "abandoned";
  round: number;
  state_version: number;
  notes: string;
  daily_day: string | null;
  hints: string[];
  result: Result | null;
  started_at: string;
  completed_at: string | null;
  content: Case;
};
type Result = {
  suspectId: string;
  reasonId: string;
  score: number;
  solved: boolean;
  answer: Case["answer"];
};
export async function catalogue(db: Sql) {
  const r = await db.query<{ content: Case }>(
    "SELECT DISTINCT ON(case_key) content FROM app_private.playable_versions ORDER BY case_key,created_at DESC,id",
  );
  return r.rows.map((x) => card(caseSchema.parse(x.content)));
}
export async function start(
  db: Database,
  actor: string,
  key: string | { day: string; versionId: string },
  premium?: PremiumPolicy,
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const daily = typeof key === "string" ? null : key;
    let dailyDay: string | null = null;
    if (daily) {
      const { day } = await dailyClock(tx);
      assert(
        daily.day === day,
        409,
        "DAILY_CHANGED",
        "The UTC day changed. Refresh today’s case.",
      );
      const prior = await tx.query<{ id: string; state: Attempt["state"] }>(
        "SELECT id,state FROM app_private.attempts WHERE principal_id=$1 AND daily_day=$2",
        [actor, day],
      );
      if (prior.rows[0] && prior.rows[0].state !== "abandoned")
        return snapshot(await owned(tx, actor, prior.rows[0].id));
      // An abandoned ranked attempt reserves the date. A replay can still be played.
      if (!prior.rows[0]) dailyDay = day;
    }
    const version =
      typeof key === "string"
        ? await playableVersion(tx, key)
        : await scheduledCase(tx, key.day);
    if (daily)
      assert(
        version?.id === daily.versionId,
        409,
        "DAILY_CHANGED",
        "Today’s case changed. Refresh the daily card.",
      );
    assert(version, 404, "NOT_FOUND", "Case unavailable.");
    const c = caseSchema.parse(version.content);
    assert(
      c.modes.includes("solo"),
      403,
      "CASE_UNAVAILABLE",
      "This case is unavailable for solo play.",
    );
    if (c.access === "paid")
      await requirePremium(tx, actor, version, "solo", premium);
    const existing = await tx.query<{ id: string; daily_day: string | null }>(
      "SELECT id,daily_day FROM app_private.attempts WHERE principal_id=$1 AND case_version_id=$2 AND state='investigating'",
      [actor, version.id],
    );
    let id = existing.rows[0]?.id;
    if (id && dailyDay && !existing.rows[0].daily_day) {
      await tx.query(
        "UPDATE app_private.attempts SET daily_day=$2 WHERE id=$1",
        [id, dailyDay],
      );
    }
    if (!id) {
      id = randomUUID();
      await tx.query(
        "INSERT INTO app_private.attempts(id,principal_id,case_version_id,daily_day) VALUES($1,$2,$3,$4)",
        [id, actor, version.id, dailyDay],
      );
    }
    return snapshot(await owned(tx, actor, id), c);
  });
}
async function owned(tx: Sql, actor: string, id: string) {
  const r = await tx.query<Attempt>(
    "SELECT a.*,a.daily_day::text AS daily_day,v.content FROM app_private.attempts a JOIN app_private.case_versions v ON v.id=a.case_version_id WHERE a.id=$1 AND a.principal_id=$2 FOR UPDATE OF a",
    [id, actor],
  );
  assert(
    r.rows[0],
    404,
    "NOT_FOUND",
    "Investigation not found for this browser.",
  );
  return r.rows[0];
}
function snapshot(a: Attempt, c: Case = caseSchema.parse(a.content)) {
  return {
    id: a.id,
    caseId: c.key,
    access: c.access,
    dailyDay: a.daily_day,
    title: c.title,
    briefing: c.briefing,
    state: a.state,
    round: a.round,
    totalRounds: c.rounds.length,
    stateVersion: a.state_version,
    startedAt: a.started_at,
    completedAt: a.completed_at,
    notes: a.notes,
    suspects: c.suspects,
    reasons: c.reasons,
    rounds: c.rounds
      .filter((r) => r.number <= a.round)
      .map((r) => ({
        number: r.number,
        title: r.title,
        clues: r.clues,
        hints: r.hints.map((h) => ({
          id: h.id,
          tier: h.tier,
          ...(a.hints.includes(h.id) ? { text: h.text } : {}),
        })),
      })),
    result: a.result,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
export async function read(db: Database, actor: string, id: string) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    return snapshot(await owned(tx, actor, id));
  });
}
export async function mutate(
  db: Database,
  actor: string,
  id: string,
  action: string,
  body: {
    expectedVersion: number;
    text?: string;
    hintId?: string;
    suspectId?: string;
    reasonId?: string;
  },
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const a = await owned(tx, actor, id),
      c = caseSchema.parse(a.content);
    if (action === "accusation" && a.result) return snapshot(a, c); // Immutable result on retried submission.
    assert(
      a.state_version === body.expectedVersion,
      409,
      "STALE_STATE",
      "This investigation changed. Review the latest state and try again.",
    );
    assert(
      a.state === "investigating",
      422,
      "READ_ONLY",
      "This investigation is complete.",
    );
    if (action === "advance") {
      assert(
        a.round < c.rounds.length,
        422,
        "FINAL_ROUND",
        "All rounds are unlocked. Make your accusation.",
      );
      a.round++;
    } else if (action === "notes") {
      a.notes = body.text ?? "";
    } else if (action === "hints") {
      assert(
        c.rounds
          .filter((r) => r.number <= a.round)
          .some((r) => r.hints.some((h) => h.id === body.hintId)),
        404,
        "HINT_UNAVAILABLE",
        "Hint unavailable.",
      );
      if (!a.hints.includes(body.hintId!)) a.hints.push(body.hintId!);
    } else if (action === "accusation") {
      assert(
        a.round === c.rounds.length,
        422,
        "ROUND_LOCKED",
        "Finish the investigation rounds first.",
      );
      assert(
        c.suspects.some((s) => s.id === body.suspectId) &&
          c.reasons.some((r) => r.id === body.reasonId),
        400,
        "CHOICE_INVALID",
        "Choose a valid suspect and reason.",
      );
      const score =
        (body.suspectId === c.answer.suspectId ? 60 : 0) +
        (body.reasonId === c.answer.reasonId ? 40 : 0);
      a.result = {
        suspectId: body.suspectId!,
        reasonId: body.reasonId!,
        score,
        solved: score === 100,
        answer: c.answer,
      };
      a.state = "revealed";
    } else assert(false, 404, "NOT_FOUND", "Action unavailable.");
    await tx.query(
      "UPDATE app_private.attempts SET round=$2,state=$3,state_version=state_version+1,notes=$4,hints=$5,result=$6,completed_at=CASE WHEN $3='revealed' THEN now() ELSE NULL END WHERE id=$1",
      [
        id,
        a.round,
        a.state,
        a.notes,
        JSON.stringify(a.hints),
        a.result ? JSON.stringify(a.result) : null,
      ],
    );
    return snapshot(await owned(tx, actor, id), c);
  });
}
export async function library(db: Sql, actor: string) {
  return (
    await db.query<{
      id: string;
      state: string;
      started_at: string;
      result: { score: number } | null;
      title: string;
    }>(
      "SELECT a.id,a.state,a.started_at,CASE WHEN a.result IS NULL THEN NULL ELSE jsonb_build_object('score',a.result->'score') END AS result,v.content->>'title' AS title FROM app_private.attempts a JOIN app_private.case_versions v ON v.id=a.case_version_id WHERE a.principal_id=$1 ORDER BY a.started_at DESC LIMIT 100",
      [actor],
    )
  ).rows;
}
