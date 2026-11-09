import { randomBytes, randomUUID } from "node:crypto";
import type { Sql, Database } from "../db/types";
import { assert } from "./errors";
import { hash, limit } from "./identity";
import { newSecret, seal, unseal, matchingCounter } from "../security/totp";
export const staffRoles = [
  "content_editor",
  "content_publisher",
  "finance",
  "admin",
] as const;
export type StaffRole = (typeof staffRoles)[number];
export async function audit(
  db: Sql,
  actor: string,
  action: string,
  entity: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO app_private.audit_events(id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, entity, JSON.stringify(details)],
  );
}
export async function staffMember(db: Sql, actor: string) {
  const row = (
    await db.query<{ roles: StaffRole[]; secret_cipher: string | null }>(
      "SELECT roles,secret_cipher FROM app_private.staff_members WHERE principal_id=$1 AND active FOR SHARE",
      [actor],
    )
  ).rows[0];
  assert(
    row,
    403,
    "STAFF_DENIED",
    "Staff access has not been granted to this account.",
  );
  return row;
}
export async function requireStaff(
  db: Sql,
  actor: string,
  playerToken: string,
  staffToken: string | undefined,
  role: StaffRole | "read" | "editorial",
) {
  const member = await staffMember(db, actor);
  assert(
    role === "read" ||
      (role === "editorial"
        ? member.roles.some(
            (item) => item === "content_editor" || item === "content_publisher",
          )
        : member.roles.includes(role)) ||
      member.roles.includes("admin"),
    403,
    "ROLE_DENIED",
    "This staff role cannot perform that action.",
  );
  assert(
    staffToken,
    403,
    "MFA_REQUIRED",
    "Verify your authenticator to open the staff workspace.",
  );
  const row = await db.query(
    "SELECT 1 FROM app_private.staff_sessions s JOIN app_private.sessions p ON p.token_hash=s.player_session_hash WHERE s.token_hash=$1 AND s.principal_id=$2 AND s.player_session_hash=$3 AND s.expires_at>now() AND p.expires_at>now() AND p.principal_id=$2 FOR SHARE OF s,p",
    [hash(staffToken), actor, hash(playerToken)],
  );
  assert(
    row.rows.length,
    403,
    "MFA_REQUIRED",
    "Staff verification expired. Verify your authenticator again.",
  );
  return member.roles;
}
export async function enroll(
  db: Database,
  actor: string,
  playerToken: string,
  master: string,
) {
  return db.transaction(async (tx) => {
    await tx.query(
      "SELECT principal_id FROM app_private.staff_members WHERE principal_id=$1 FOR UPDATE",
      [actor],
    );
    const m = await staffMember(tx, actor);
    assert(
      !m.secret_cipher,
      409,
      "MFA_CONFIGURED",
      "Authenticator is already configured.",
    );
    const recent = await tx.query(
      "SELECT 1 FROM app_private.sessions WHERE token_hash=$1 AND principal_id=$2 AND issued_at>now()-interval '10 minutes' AND expires_at>now()",
      [hash(playerToken), actor],
    );
    assert(
      recent.rows.length,
      403,
      "FRESH_LOGIN_REQUIRED",
      "Sign out and verify your email again before authenticator setup.",
    );
    const secret = newSecret();
    await tx.query(
      "UPDATE app_private.staff_members SET pending_cipher=$2,pending_until=now()+interval '10 minutes' WHERE principal_id=$1",
      [actor, seal(secret, master, actor)],
    );
    await audit(tx, actor, "staff.mfa_enrollment", actor);
    return { secret, issuer: "PlotRush", period: 30, digits: 6 };
  });
}
export async function unlock(
  db: Database,
  actor: string,
  playerToken: string,
  code: string,
  master: string,
) {
  await limit(db, "staff-mfa:" + actor, 5, 300);
  return db.transaction(async (tx) => {
    const r = (
      await tx.query<{
        secret_cipher: string | null;
        pending_cipher: string | null;
        pending_valid: boolean;
        last_counter: string;
        clock: string;
        active: boolean;
      }>(
        "SELECT *,pending_until>now() AS pending_valid,clock_timestamp() AS clock FROM app_private.staff_members WHERE principal_id=$1 FOR UPDATE",
        [actor],
      )
    ).rows[0];
    assert(r?.active, 403, "STAFF_DENIED", "Staff access unavailable.");
    const cipher =
      r.secret_cipher ?? (r.pending_valid ? r.pending_cipher : null);
    assert(
      cipher,
      403,
      "MFA_SETUP_REQUIRED",
      "Set up your authenticator first.",
    );
    const counter = matchingCounter(
      unseal(cipher, master, actor),
      code,
      new Date(r.clock).getTime(),
      Number(r.last_counter),
    );
    assert(
      counter !== null,
      403,
      "MFA_INVALID",
      "Invalid or already used authenticator code.",
    );
    const player = await tx.query(
      "SELECT 1 FROM app_private.sessions WHERE token_hash=$1 AND principal_id=$2 AND expires_at>now()",
      [hash(playerToken), actor],
    );
    assert(player.rows.length, 403, "SESSION_REQUIRED", "Sign in again.");
    await tx.query(
      "UPDATE app_private.staff_members SET secret_cipher=$2,pending_cipher=NULL,pending_until=NULL,last_counter=$3 WHERE principal_id=$1",
      [actor, cipher, counter],
    );
    const token = randomBytes(32).toString("hex");
    await tx.query(
      "INSERT INTO app_private.staff_sessions(token_hash,principal_id,player_session_hash) VALUES($1,$2,$3)",
      [hash(token), actor, hash(playerToken)],
    );
    await audit(tx, actor, "staff.mfa_verified", actor);
    return token;
  });
}
