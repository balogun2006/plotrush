import type { Sql } from "../db/types";
import { caseSchema, type Case } from "./content";

export async function dailyClock(db: Sql) {
  const result = await db.query<{ day: string; clock: Date | string }>(
    "SELECT timezone('UTC',now())::date::text AS day, now() AS clock",
  );
  return result.rows[0];
}

export async function scheduledCase(db: Sql, day: string) {
  const { rows } = await db.query<{ id: string; content: Case }>(
    `SELECT v.id,v.content FROM app_private.daily_calendar d
     JOIN app_private.case_versions v ON v.id=d.version_id
     JOIN app_private.case_releases r ON r.case_key=v.case_key AND r.enabled
     WHERE d.day=$1 AND v.status='published'`,
    [day],
  );
  if (!rows[0]) return null;
  const c = caseSchema.parse(rows[0].content);
  return c.access === "free" && c.kind === "mini" && c.modes.includes("solo")
    ? { id: rows[0].id, content: c, status: "published" as const }
    : null;
}

async function dailyHistory(db: Sql, actor: string, day: string) {
  const { rows } = await db.query<{
    id: string;
    version_id: string;
    day: string;
    case_key: string;
    title: string;
    state: string;
  }>(
    `SELECT a.id,v.id AS version_id,a.daily_day::text AS day,v.case_key,v.content->>'title' AS title,a.state
     FROM app_private.attempts a JOIN app_private.case_versions v ON v.id=a.case_version_id
     WHERE a.principal_id=$1 AND a.daily_day<=$2
     ORDER BY a.daily_day DESC`,
    [actor, day],
  );
  return rows;
}

export async function dailyOverview(db: Sql, actor: string | null) {
  const { day, clock } = await dailyClock(db);
  const reset = new Date(day);
  reset.setUTCDate(reset.getUTCDate() + 1);
  const history = actor ? await dailyHistory(db, actor, day) : [];
  const today = history.find((a) => a.day === day && a.state !== "abandoned");
  const previous = history.find(
    (a) => a.day < day && a.state === "investigating",
  );
  const scheduled = today ? null : await scheduledCase(db, day);
  const release = today
    ? {
        caseId: today.case_key,
        title: today.title,
        versionId: today.version_id,
        attemptId: today.id,
        completed: today.state === "revealed",
      }
    : scheduled
      ? {
          caseId: scheduled.content.key,
          title: scheduled.content.title,
          versionId: scheduled.id,
          attemptId: null,
          completed: false,
        }
      : null;
  const archive = release
    ? null
    : ((
        await db.query<{ caseId: string; title: string }>(
          `SELECT v.case_key AS "caseId",v.content->>'title' AS title
     FROM app_private.playable_versions v
     WHERE v.content->>'access'='free' AND v.content->>'kind'='mini'
       AND (v.content->'modes') ? 'solo'
     ORDER BY v.case_key,v.created_at DESC,v.id LIMIT 1`,
        )
      ).rows[0] ?? null);
  // A repeated case can be played again, but only its first daily result earns credit.
  const firstCompletions = new Map<string, string>();
  for (const a of history)
    if (a.state === "revealed") firstCompletions.set(a.case_key, a.day);
  const credit = new Set(firstCompletions.values());
  const cursor = new Date(day);
  if (!credit.has(day)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (credit.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return {
    day,
    serverTime: new Date(clock).toISOString(),
    resetsAt: reset.toISOString(),
    streak,
    release,
    archive,
    resume: previous
      ? {
          caseId: previous.case_key,
          title: previous.title,
          day: previous.day,
          attemptId: previous.id,
        }
      : null,
  };
}
