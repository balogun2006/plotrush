import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Database, Sql } from "../db/types";
import { assert } from "./errors";
import {
  activeThemes,
  activeMoods,
  themeRegistry,
  moodRegistry,
} from "./themes";
import {
  emptyInterests,
  interestInput,
  type Interests,
  type InterestOptions,
} from "../contracts/interests";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function identity(db: Sql, token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (
    (
      await db.query<{ principal_id: string }>(
        "SELECT s.principal_id FROM app_private.sessions s JOIN app_private.principals p ON p.id=s.principal_id WHERE s.token_hash=$1 AND s.expires_at>now() AND p.merged_into IS NULL",
        [hash(token)],
      )
    ).rows[0]?.principal_id ?? null
  );
}
export async function createIdentity(db: Database) {
  const token = randomBytes(32).toString("hex"),
    id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO app_private.principals(id) VALUES($1)", [id]);
    await tx.query(
      "INSERT INTO app_private.sessions(token_hash,principal_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [hash(token), id],
    );
  });
  return { token, id };
}
export async function limit(
  db: Sql,
  key: string,
  max: number,
  seconds: number,
) {
  const r = await db.query<{ hits: number }>(
    "INSERT INTO app_private.rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN app_private.rate_limits.expires_at<=now() THEN 1 ELSE app_private.rate_limits.hits+1 END,expires_at=CASE WHEN app_private.rate_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE app_private.rate_limits.expires_at END RETURNING hits",
    [key, seconds],
  );
  assert(
    r.rows[0].hits <= max,
    429,
    "RATE_LIMITED",
    "Please wait a moment before trying again.",
  );
}
export async function interests(db: Sql, actor: string) {
  const saved =
    (
      await db.query<Interests>(
        'SELECT themes,moods,preferred_difficulty AS "preferredDifficulty",personalisation_enabled AS "personalisationEnabled",version FROM app_private.interests WHERE principal_id=$1',
        [actor],
      )
    ).rows[0] ?? emptyInterests();
  const aliases = (
    await db.query<{ old: string; slug: string }>(
      "SELECT a.slug AS old,t.slug FROM app_private.theme_aliases a JOIN app_private.themes t ON t.id=a.theme_id",
    )
  ).rows;
  return {
    ...saved,
    themes: [
      ...new Set(
        saved.themes.map((s) => aliases.find((a) => a.old === s)?.slug ?? s),
      ),
    ],
  };
}
export async function saveInterests(
  db: Database,
  actor: string,
  themes: string[],
  expectedVersion: number,
  options: InterestOptions = {},
) {
  const input = interestInput.parse({ ...options, themes, expectedVersion });
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await tx.query(
      "SELECT id FROM app_private.principals WHERE id=$1 FOR UPDATE",
      [actor],
    );
    const current = await interests(tx, actor);
    await activeThemes(
      tx,
      input.themes.filter((t) => !current.themes.includes(t)),
      true,
    );
    await activeMoods(
      tx,
      (input.moods ?? current.moods).filter((m) => !current.moods.includes(m)),
      true,
    );
    assert(
      current.version === expectedVersion,
      409,
      "STALE_STATE",
      "Your interests changed. Reload and try again.",
    );
    await tx.query(
      "INSERT INTO app_private.interests(principal_id,themes,moods,preferred_difficulty,personalisation_enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(principal_id) DO UPDATE SET themes=excluded.themes,moods=excluded.moods,preferred_difficulty=excluded.preferred_difficulty,personalisation_enabled=excluded.personalisation_enabled,version=app_private.interests.version+1,updated_at=now()",
      [
        actor,
        JSON.stringify(input.themes),
        JSON.stringify(input.moods ?? current.moods),
        input.preferredDifficulty === undefined
          ? current.preferredDifficulty
          : input.preferredDifficulty,
        input.personalisationEnabled ?? current.personalisationEnabled,
      ],
    );
    return interests(tx, actor);
  });
}

// Auth merges fence gameplay mutations through the principal row. An in-flight
// request authenticated before a merge must not create orphaned guest progress.
export async function lockPrincipal(db: Sql, actor: string) {
  const active = await db.query(
    "SELECT id FROM app_private.principals WHERE id=$1 AND merged_into IS NULL FOR UPDATE",
    [actor],
  );
  assert(
    active.rows.length,
    401,
    "SESSION_REQUIRED",
    "Sign in again to continue.",
  );
}

export async function uuidInterests(db: Sql, actor: string | null) {
  const saved = actor ? await interests(db, actor) : emptyInterests();
  const ts = await themeRegistry(db),
    ms = await moodRegistry(db);
  return {
    themeIds: ts.filter((t) => saved.themes.includes(t.slug)).map((t) => t.id),
    moodIds: ms.filter((m) => saved.moods.includes(m.slug)).map((m) => m.id),
    preferredDifficulty: saved.preferredDifficulty,
    personalisationEnabled: saved.personalisationEnabled,
    preferenceVersion: saved.version,
  };
}
export async function saveUuidInterests(
  db: Database,
  actor: string,
  input: import("zod").infer<
    typeof import("../contracts/interests").uuidInterestInput
  >,
) {
  const ts = await themeRegistry(db),
    ms = await moodRegistry(db);
  assert(
    input.themeIds.every((id) => ts.some((t) => t.id === id)) &&
      input.moodIds.every((id) => ms.some((m) => m.id === id)),
    400,
    "FILTER_INVALID",
    "Unknown taxonomy identity.",
  );
  await saveInterests(
    db,
    actor,
    ts.filter((t) => input.themeIds.includes(t.id)).map((t) => t.slug),
    input.expectedVersion,
    {
      moods: ms.filter((m) => input.moodIds.includes(m.id)).map((m) => m.slug),
      preferredDifficulty: input.preferredDifficulty,
      personalisationEnabled: input.personalisationEnabled,
    },
  );
  return uuidInterests(db, actor);
}
