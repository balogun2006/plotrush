import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Database, Sql } from "../db/types";
import { assert } from "./errors";
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
  return (
    (
      await db.query<{ themes: string[]; version: number }>(
        "SELECT themes,version FROM app_private.interests WHERE principal_id=$1",
        [actor],
      )
    ).rows[0] ?? { themes: [], version: 0 }
  );
}
export async function saveInterests(
  db: Database,
  actor: string,
  themes: string[],
  expectedVersion: number,
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await tx.query(
      "SELECT id FROM app_private.principals WHERE id=$1 FOR UPDATE",
      [actor],
    );
    const current = await interests(tx, actor);
    assert(
      current.version === expectedVersion,
      409,
      "STALE_STATE",
      "Your interests changed. Reload and try again.",
    );
    await tx.query(
      "INSERT INTO app_private.interests(principal_id,themes) VALUES($1,$2) ON CONFLICT(principal_id) DO UPDATE SET themes=excluded.themes,version=app_private.interests.version+1,updated_at=now()",
      [actor, JSON.stringify(themes)],
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
