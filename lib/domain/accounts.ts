import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Database, Sql } from "../db/types";
import { assert } from "./errors";
import { hash, interests, lockPrincipal } from "./identity";
import { emailSchema } from "../contracts/account-commerce";
export interface Mailer {
  send(message: {
    to: string;
    code: string;
    challengeId: string;
  }): Promise<void>;
}
const digest = (secret: string, id: string, code: string) =>
  createHmac("sha256", secret)
    .update(id + ":" + code)
    .digest("hex");
export async function account(db: Sql, actor: string) {
  const a = (
    await db.query<{ email: string; verified_at: string }>(
      "SELECT email,verified_at FROM app_private.accounts WHERE principal_id=$1",
      [actor],
    )
  ).rows[0];
  return a
    ? { kind: "verified" as const, email: a.email, verifiedAt: a.verified_at }
    : { kind: "guest" as const };
}
export async function requestCode(
  db: Database,
  actor: string,
  email: string,
  secret: string,
  mailer: Mailer,
) {
  email = emailSchema.parse(email);
  assert(
    secret.length >= 32,
    503,
    "AUTH_UNAVAILABLE",
    "Sign-in is not configured yet.",
  );
  const id = randomUUID(),
    code = randomInt(0, 100000000).toString().padStart(8, "0");
  await db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    const current = await account(tx, actor);
    assert(
      current.kind === "guest" || current.email === email,
      409,
      "SIGN_OUT_FIRST",
      "Sign out before using another email.",
    );
    await tx.query(
      "SELECT id FROM app_private.principals WHERE id=$1 FOR UPDATE",
      [actor],
    );
    await tx.query(
      "UPDATE app_private.auth_challenges SET used_at=now() WHERE principal_id=$1 AND used_at IS NULL",
      [actor],
    );
    await tx.query(
      "INSERT INTO app_private.auth_challenges(id,principal_id,email,code_hash) VALUES($1,$2,$3,$4)",
      [id, actor, email, digest(secret, id, code)],
    );
  });
  try {
    await mailer.send({ to: email, code, challengeId: id });
    await db.query(
      "UPDATE app_private.auth_challenges SET delivered=true WHERE id=$1",
      [id],
    );
  } catch {
    await db.query(
      "UPDATE app_private.auth_challenges SET used_at=now() WHERE id=$1",
      [id],
    );
    assert(
      false,
      503,
      "EMAIL_UNAVAILABLE",
      "The code could not be sent. Please try again later.",
    );
  }
  return { challengeId: id, expiresInSeconds: 600 };
}
async function audit(
  tx: Sql,
  actor: string,
  action: string,
  entity: string,
  details: unknown = {},
) {
  await tx.query(
    "INSERT INTO app_private.audit_events(id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, entity, JSON.stringify(details)],
  );
}
async function merge(tx: Sql, source: string, target: string) {
  // Lock affected rooms before changing memberships. Active games must finish or
  // be left first; account creation on the same principal needs no such merge.
  const rooms = (
    await tx.query<{
      id: string;
      state: {
        phase: string;
        host: string;
        assignments: Record<string, string>;
        votes: Record<string, unknown>;
      };
    }>(
      "SELECT r.id,r.state FROM app_private.rooms r WHERE r.host_id IN ($1,$2) OR EXISTS(SELECT 1 FROM app_private.room_members m WHERE m.room_id=r.id AND m.principal_id IN ($1,$2)) ORDER BY r.id FOR UPDATE OF r",
      [source, target],
    )
  ).rows;
  for (const r of rooms) {
    const live =
      (
        await tx.query(
          "SELECT 1 FROM app_private.room_members WHERE room_id=$1 AND principal_id IN ($2,$3) AND NOT departed",
          [r.id, source, target],
        )
      ).rows.length > 0;
    assert(
      !live || ["revealed", "cancelled", "expired"].includes(r.state.phase),
      409,
      "ACTIVE_ROOM",
      "Finish or leave your active group rooms before combining accounts.",
    );
  }
  // Preserve both histories. A duplicate active source attempt becomes a saved
  // abandoned attempt rather than overwriting destination notes or first result.
  await tx.query(
    "UPDATE app_private.attempts s SET state='abandoned' WHERE s.principal_id=$1 AND s.state='investigating' AND EXISTS(SELECT 1 FROM app_private.attempts t WHERE t.principal_id=$2 AND t.case_version_id=s.case_version_id AND t.state='investigating')",
    [source, target],
  );
  await tx.query(
    "UPDATE app_private.attempts SET principal_id=$2 WHERE principal_id=$1",
    [source, target],
  );
  const s = await interests(tx, source),
    t = await interests(tx, target);
  const selected = [...new Set([...t.themes, ...s.themes])].slice(0, 6);
  if (s.version || t.version)
    await tx.query(
      "INSERT INTO app_private.interests(principal_id,themes) VALUES($1,$2) ON CONFLICT(principal_id) DO UPDATE SET themes=$2,version=app_private.interests.version+1,updated_at=now()",
      [target, JSON.stringify(selected)],
    );
  await tx.query("DELETE FROM app_private.interests WHERE principal_id=$1", [
    source,
  ]);
  for (const r of rooms) {
    const src = (
      await tx.query(
        "SELECT 1 FROM app_private.room_members WHERE room_id=$1 AND principal_id=$2",
        [r.id, source],
      )
    ).rows.length;
    if (!src) continue;
    const dst = (
      await tx.query(
        "SELECT 1 FROM app_private.room_members WHERE room_id=$1 AND principal_id=$2",
        [r.id, target],
      )
    ).rows.length;
    if (dst)
      await tx.query(
        "DELETE FROM app_private.room_members WHERE room_id=$1 AND principal_id=$2",
        [r.id, source],
      );
    else
      await tx.query(
        "UPDATE app_private.room_members SET principal_id=$3 WHERE room_id=$1 AND principal_id=$2",
        [r.id, source, target],
      );
    for (const key of Object.keys(r.state.assignments))
      if (r.state.assignments[key] === source)
        r.state.assignments[key] = target;
    if (r.state.host === source) r.state.host = target;
    if (r.state.votes[source] && !r.state.votes[target])
      r.state.votes[target] = r.state.votes[source];
    delete r.state.votes[source];
    await tx.query(
      "UPDATE app_private.rooms SET host_id=CASE WHEN host_id=$2 THEN $3 ELSE host_id END,state=$4,state_version=state_version+1 WHERE id=$1",
      [r.id, source, target, JSON.stringify(r.state)],
    );
  }
  // Orders belong only to verified buyers, so anonymous merges cannot carry
  // receipts or entitlements. Reject any unexpected ownership instead of moving it.
  assert(
    !(
      await tx.query(
        "SELECT 1 FROM app_private.orders WHERE buyer_id=$1 LIMIT 1",
        [source],
      )
    ).rows.length,
    409,
    "MERGE_REVIEW_REQUIRED",
    "This account needs a support review before merging.",
  );
  await tx.query(
    "UPDATE app_private.principals SET merged_into=$2 WHERE id=$1",
    [source, target],
  );
  await tx.query(
    "DELETE FROM app_private.sessions WHERE principal_id IN ($1,$2)",
    [source, target],
  );
  await tx.query(
    "UPDATE app_private.auth_challenges SET used_at=now() WHERE principal_id=$1 AND used_at IS NULL",
    [source],
  );
  await audit(tx, target, "guest_progress_merged", source);
}
export async function verifyCode(
  db: Database,
  actor: string,
  id: string,
  code: string,
  secret: string,
  confirmMerge = false,
) {
  const result = await db.transaction(async (tx) => {
    // Global auth lock prevents new-address races across principals. Gameplay
    // remains independently transactional; this small lock covers verification only.
    await tx.query("SELECT pg_advisory_xact_lock(442712)");
    const challenge = (
      await tx.query<{
        email: string;
        code_hash: string;
        attempts: number;
        valid: boolean;
        delivered: boolean;
      }>(
        "SELECT email,code_hash,attempts,delivered,(used_at IS NULL AND expires_at>now()) AS valid FROM app_private.auth_challenges WHERE id=$1 AND principal_id=$2 FOR UPDATE",
        [id, actor],
      )
    ).rows[0];
    const failure = (status: number, code: string, message: string) =>
      ({ failure: { status, code, message } }) as const;
    if (
      !challenge ||
      !challenge.valid ||
      !challenge.delivered ||
      challenge.attempts >= 5
    )
      return failure(
        400,
        "CODE_INVALID",
        "This code is invalid or expired. Request a new one.",
      );
    await tx.query(
      "UPDATE app_private.auth_challenges SET attempts=attempts+1 WHERE id=$1",
      [id],
    );
    if (
      secret.length < 32 ||
      !/^\d{8}$/.test(code) ||
      !timingSafeEqual(
        Buffer.from(challenge.code_hash),
        Buffer.from(digest(secret, id, code)),
      )
    )
      return failure(
        400,
        "CODE_INVALID",
        "This code is invalid or expired. Request a new one.",
      );
    const existing = (
      await tx.query<{ principal_id: string }>(
        "SELECT principal_id FROM app_private.accounts WHERE email=$1",
        [challenge.email],
      )
    ).rows[0];
    const target = existing?.principal_id ?? actor;
    await tx.query(
      "SELECT id FROM app_private.principals WHERE id IN ($1,$2) ORDER BY id FOR UPDATE",
      [actor, target],
    );
    if (target !== actor) {
      const current = await account(tx, actor);
      if (current.kind !== "guest")
        return failure(
          409,
          "SIGN_OUT_FIRST",
          "Sign out before using another account.",
        );
      if (!confirmMerge)
        return failure(
          409,
          "MERGE_CONFIRMATION_REQUIRED",
          "Confirm combining this browser's progress with your existing account.",
        );
      await merge(tx, actor, target);
    } else {
      await tx.query(
        "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2) ON CONFLICT(principal_id) DO NOTHING",
        [actor, challenge.email],
      );
      await tx.query("DELETE FROM app_private.sessions WHERE principal_id=$1", [
        actor,
      ]);
    }
    await tx.query(
      "UPDATE app_private.auth_challenges SET used_at=now() WHERE id=$1",
      [id],
    );
    const token = randomBytes(32).toString("hex");
    await tx.query(
      "INSERT INTO app_private.sessions(token_hash,principal_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [hash(token), target],
    );
    await audit(tx, target, "email_verified", id);
    return { token, account: await account(tx, target) };
  });
  if ("failure" in result) {
    const f = result.failure;
    assert(false, f.status, f.code, f.message);
  }
  return result;
}
export async function signOut(db: Sql, token: string) {
  await db.query("DELETE FROM app_private.sessions WHERE token_hash=$1", [
    hash(token),
  ]);
}
