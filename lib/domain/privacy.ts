import { randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { assert } from "./errors";
import { hash, lockPrincipal, uuidInterests } from "./identity";
import { requireStaff, audit } from "./staff";
import type { StaffContext } from "./editorial";
import { privacyReviewInput, type PrivacyRequest } from "../contracts/privacy";
import { z } from "zod";

const requestColumns =
  'id,kind,state,revision,requested_at::text AS "requestedAt",updated_at::text AS "updatedAt"';
export async function freshAccount(tx: Sql, actor: string, token: string) {
  const row = await tx.query(
    "SELECT 1 FROM app_private.accounts a JOIN app_private.sessions s ON s.principal_id=a.principal_id JOIN app_private.principals p ON p.id=a.principal_id WHERE a.principal_id=$1 AND s.token_hash=$2 AND s.expires_at>now() AND s.issued_at>now()-interval '10 minutes' AND p.deleted_at IS NULL AND p.merged_into IS NULL",
    [actor, hash(token)],
  );
  assert(
    row.rows.length,
    403,
    "REAUTH_REQUIRED",
    "Verify your email again before exporting account data or managing deletion.",
  );
}
export async function privacyRequests(db: Sql, actor: string) {
  return (
    await db.query<PrivacyRequest>(
      `SELECT ${requestColumns} FROM app_private.privacy_requests WHERE principal_id=$1 ORDER BY requested_at DESC LIMIT 20`,
      [actor],
    )
  ).rows;
}
export async function requestPrivacy(
  db: Database,
  actor: string,
  token: string,
  kind: "export" | "deletion",
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await freshAccount(tx, actor, token);
    const existing = (
      await tx.query<PrivacyRequest>(
        `SELECT ${requestColumns} FROM app_private.privacy_requests WHERE principal_id=$1 AND kind=$2 AND state IN ('ready','pending','deferred')`,
        [actor, kind],
      )
    ).rows[0];
    if (existing) return existing;
    const id = randomUUID();
    await tx.query(
      "INSERT INTO app_private.privacy_requests(id,principal_id,kind,state) VALUES($1,$2,$3,$4)",
      [id, actor, kind, kind === "export" ? "ready" : "pending"],
    );
    await audit(tx, actor, "privacy." + kind + "_requested", id);
    return (await privacyRequests(tx, actor)).find((r) => r.id === id)!;
  });
}
export async function cancelDeletion(
  db: Database,
  actor: string,
  token: string,
  id: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    await lockPrincipal(tx, actor);
    await freshAccount(tx, actor, token);
    const result = await tx.query(
      "UPDATE app_private.privacy_requests SET state='cancelled',revision=revision+1,updated_at=now() WHERE id=$1 AND principal_id=$2 AND kind='deletion' AND state IN ('pending','deferred') AND revision=$3 RETURNING id",
      [id, actor, revision],
    );
    assert(
      result.rows.length,
      409,
      "STALE_STATE",
      "This deletion request changed or is unavailable. Reload before trying again.",
    );
    await audit(tx, actor, "privacy.deletion_cancelled", id);
    return (await privacyRequests(tx, actor)).find((r) => r.id === id)!;
  });
}
export async function exportAccount(
  db: Database,
  actor: string,
  token: string,
  id: string,
) {
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await lockPrincipal(tx, actor);
    await freshAccount(tx, actor, token);
    const request = await tx.query(
      "SELECT 1 FROM app_private.privacy_requests WHERE id=$1 AND principal_id=$2 AND kind='export' AND state='ready'",
      [id, actor],
    );
    assert(
      request.rows.length,
      404,
      "NOT_FOUND",
      "Export request unavailable.",
    );
    const profile = (
      await tx.query(
        "SELECT email,verified_at::text AS verified_at FROM app_private.accounts WHERE principal_id=$1",
        [actor],
      )
    ).rows[0];
    const preferences = await uuidInterests(tx, actor);
    const investigations = (
      await tx.query(
        "SELECT a.id,v.case_key,a.case_version_id,a.state,a.notes,a.started_at,a.completed_at,a.result->'score' AS score,a.result->'solved' AS solved FROM app_private.attempts a JOIN app_private.case_versions v ON v.id=a.case_version_id WHERE a.principal_id=$1 ORDER BY a.started_at,a.id",
        [actor],
      )
    ).rows;
    const memberships = (
      await tx.query(
        "SELECT room_id,nickname,seat,departed,joined_at FROM app_private.room_members WHERE principal_id=$1 ORDER BY joined_at,room_id",
        [actor],
      )
    ).rows;
    const purchases = (
      await tx.query(
        "SELECT id,product_id,amount_minor,currency,status,environment,created_at,paid_at FROM app_private.orders WHERE buyer_id=$1 ORDER BY created_at,id",
        [actor],
      )
    ).rows;
    await audit(tx, actor, "privacy.export_downloaded", id);
    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      profile,
      preferences,
      investigations,
      memberships,
      purchases,
      scope:
        "Your profile, preferences, notes, investigation summaries, memberships and orders. Other players' evidence/votes, case solutions and service credentials are excluded.",
    };
  });
}
async function deletionBlockers(tx: Sql, actor: string) {
  const flags = (
    await tx.query<{
      active_room: boolean;
      unresolved_payment: boolean;
      financial_records: boolean;
      staff: boolean;
    }>(
      `SELECT
 EXISTS(SELECT 1 FROM app_private.rooms r WHERE (r.host_id=$1 OR EXISTS(SELECT 1 FROM app_private.room_members m WHERE m.room_id=r.id AND m.principal_id=$1 AND NOT m.departed)) AND r.state->>'phase' NOT IN ('revealed','cancelled','expired')) AS active_room,
 EXISTS(SELECT 1 FROM app_private.orders o WHERE o.buyer_id=$1 AND ((o.status='pending' AND o.expires_at>now()) OR EXISTS(SELECT 1 FROM app_private.refund_requests f WHERE f.order_id=o.id AND f.closed_at IS NULL) OR EXISTS(SELECT 1 FROM app_private.entitlements e WHERE e.origin_order_id=o.id AND e.dispute_hold))) AS unresolved_payment,
 EXISTS(SELECT 1 FROM app_private.orders WHERE buyer_id=$1) AS financial_records,
 EXISTS(SELECT 1 FROM app_private.staff_members WHERE principal_id=$1 AND active) AS staff`,
      [actor],
    )
  ).rows[0];
  return Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);
}
export async function privacyQueue(db: Database, ctx: StaffContext) {
  await requireStaff(db, ctx.actor, ctx.playerToken, ctx.staffToken, "admin");
  const rows = (
    await db.query<PrivacyRequest & { principalId: string }>(
      `SELECT ${requestColumns},principal_id AS "principalId" FROM app_private.privacy_requests WHERE kind='deletion' AND state IN ('pending','deferred') ORDER BY requested_at LIMIT 50`,
    )
  ).rows;
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      blockers: await deletionBlockers(db, r.principalId),
    })),
  );
}
async function scrubPrincipal(tx: Sql, actor: string) {
  // Preserve opaque references and other players' history, erase the owner's votes and staff secrets.
  await tx.query(
    "UPDATE app_private.staff_members SET active=false,secret_cipher=NULL,pending_cipher=NULL,pending_until=NULL,last_counter=-1 WHERE principal_id=$1",
    [actor],
  );
  await tx.query(
    "UPDATE app_private.rooms SET state=jsonb_set(state,'{votes}',coalesce(state->'votes','{}'::jsonb)-$1) WHERE state->'votes' ? $1",
    [actor],
  );
  await tx.query("DELETE FROM app_private.sessions WHERE principal_id=$1", [
    actor,
  ]);
  await tx.query(
    "DELETE FROM app_private.auth_challenges WHERE principal_id=$1",
    [actor],
  );
  await tx.query("DELETE FROM app_private.interests WHERE principal_id=$1", [
    actor,
  ]);
  await tx.query("DELETE FROM app_private.attempts WHERE principal_id=$1", [
    actor,
  ]);
  await tx.query(
    "UPDATE app_private.room_members SET nickname='Deleted player',departed=true,ready=false WHERE principal_id=$1",
    [actor],
  );
  await tx.query(
    "UPDATE app_private.accounts SET email='deleted-'||principal_id::text||'@deleted.invalid' WHERE principal_id=$1",
    [actor],
  );
  await tx.query(
    "UPDATE app_private.entitlements SET state='revoked' WHERE owner_id=$1",
    [actor],
  );
  await tx.query(
    "UPDATE app_private.principals SET deleted_at=coalesce(deleted_at,now()) WHERE id=$1",
    [actor],
  );
}
export async function reviewDeletion(
  db: Database,
  ctx: StaffContext,
  id: string,
  input: unknown,
) {
  const b = privacyReviewInput.parse(input);
  return db.transaction(async (tx) => {
    // Fence re-verification before locking its staff session, matching auth's
    // lock order so concurrent session revocation cannot deadlock this review.
    await tx.query("SELECT pg_advisory_xact_lock(442712)");
    await requireStaff(tx, ctx.actor, ctx.playerToken, ctx.staffToken, "admin");
    const owner = (
      await tx.query<{ principal_id: string }>(
        "SELECT principal_id FROM app_private.privacy_requests WHERE id=$1",
        [id],
      )
    ).rows[0];
    assert(owner, 404, "NOT_FOUND", "Deletion request unavailable.");
    await lockPrincipal(tx, owner.principal_id);
    const request = (
      await tx.query<{ revision: number; state: string; kind: string }>(
        "SELECT revision,state,kind FROM app_private.privacy_requests WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    assert(
      request.kind === "deletion" &&
        ["pending", "deferred"].includes(request.state) &&
        request.revision === b.expectedRevision,
      409,
      "STALE_STATE",
      "Deletion request changed. Reload before reviewing.",
    );
    if (b.decision === "complete") {
      assert(
        owner.principal_id !== ctx.actor,
        409,
        "SELF_REVIEW_DENIED",
        "Another administrator must review your request.",
      );
      await tx.query(
        "SELECT r.id FROM app_private.rooms r WHERE r.host_id=$1 OR EXISTS(SELECT 1 FROM app_private.room_members m WHERE m.room_id=r.id AND m.principal_id=$1) ORDER BY r.id FOR UPDATE",
        [owner.principal_id],
      );
      assert(
        !(await deletionBlockers(tx, owner.principal_id)).length,
        409,
        "DELETION_BLOCKED",
        "Resolve active rooms and staff access first. Accounts with financial records need an approved finance retention/erasure plan before fulfilment.",
      );
      const ids = (
        await tx.query<{ id: string }>(
          "WITH RECURSIVE family AS (SELECT id FROM app_private.principals WHERE id=$1 UNION SELECT p.id FROM app_private.principals p JOIN family f ON p.merged_into=f.id) SELECT id FROM family ORDER BY id",
          [owner.principal_id],
        )
      ).rows;
      for (const item of ids) {
        await scrubPrincipal(tx, item.id);
        await tx.query(
          "INSERT INTO app_private.deletion_ledger(principal_id,request_id,retention_reference,backup_reference) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [item.id, id, b.retentionReference, b.backupReference],
        );
      }
    }
    await tx.query(
      "UPDATE app_private.privacy_requests SET state=$2,revision=revision+1,updated_at=now(),reviewed_by=$3,review_reason=$4,retention_reference=$5,backup_reference=$6 WHERE id=$1",
      [
        id,
        b.decision === "complete" ? "completed" : "deferred",
        ctx.actor,
        b.reason,
        b.retentionReference,
        b.backupReference,
      ],
    );
    await audit(
      tx,
      ctx.actor,
      "privacy.deletion_" +
        (b.decision === "complete" ? "completed" : "deferred"),
      id,
      {
        retentionReference: b.retentionReference,
        backupReference: b.backupReference,
      },
    );
    return {
      state: b.decision === "complete" ? "completed" : "deferred",
      retained: [
        "Pseudonymised financial and editorial references",
        "Other players' group history",
        "Minimal deletion/audit ledger",
        "Backup copies until approved expiry or erasure process",
      ],
    };
  });
}

export async function deletionLedger(db: Sql, ctx: StaffContext) {
  await requireStaff(db, ctx.actor, ctx.playerToken, ctx.staffToken, "admin");
  await audit(
    db,
    ctx.actor,
    "privacy.deletion_ledger_exported",
    "deletion-ledger",
  );
  return {
    formatVersion: 1,
    entries: (
      await db.query(
        'SELECT principal_id AS "principalId",request_id AS "requestId",deleted_at::text AS "deletedAt",retention_reference AS "retentionReference",backup_reference AS "backupReference" FROM app_private.deletion_ledger ORDER BY deleted_at,principal_id',
      )
    ).rows,
  };
}
const ledgerInput = z
  .object({
    formatVersion: z.literal(1),
    entries: z
      .array(
        z
          .object({
            principalId: z.uuid(),
            requestId: z.uuid().nullable(),
            deletedAt: z.string().min(10).max(60),
            retentionReference: z.string().min(10).max(300),
            backupReference: z.string().min(10).max(300),
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();
// Operator-only restore step, before exposing a restored database to the app.
export async function replayDeletionLedger(db: Database, input: unknown) {
  const ledger = ledgerInput.parse(input);
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(442712)");
    let applied = 0;
    for (const entry of ledger.entries) {
      const found = await tx.query(
        "SELECT 1 FROM app_private.principals WHERE id=$1 FOR UPDATE",
        [entry.principalId],
      );
      if (!found.rows.length) continue;
      assert(
        !(
          await tx.query(
            "SELECT 1 FROM app_private.orders WHERE buyer_id=$1 LIMIT 1",
            [entry.principalId],
          )
        ).rows.length,
        409,
        "FINANCE_REVIEW_REQUIRED",
        "Restored financial records require review before ledger replay.",
      );
      await scrubPrincipal(tx, entry.principalId);
      await tx.query(
        "INSERT INTO app_private.deletion_ledger(principal_id,request_id,deleted_at,retention_reference,backup_reference) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [
          entry.principalId,
          entry.requestId,
          entry.deletedAt,
          entry.retentionReference,
          entry.backupReference,
        ],
      );
      applied++;
    }
    return { applied };
  });
}
export async function retentionSweep(
  db: Database,
  reference: string,
  backupReference: string,
  dryRun = true,
) {
  assert(
    dryRun ||
      (reference.trim().length >= 10 && backupReference.trim().length >= 10),
    503,
    "POLICY_REQUIRED",
    "Execute requires approved retention and backup-process references.",
  );
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(442712)");
    const rows = (
      await tx.query<{
        id: string;
      }>(`SELECT p.id FROM app_private.principals p WHERE p.deleted_at IS NULL AND p.merged_into IS NULL AND p.created_at<now()-interval '60 days'
   AND NOT EXISTS(SELECT 1 FROM app_private.accounts a WHERE a.principal_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app_private.orders o WHERE o.buyer_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app_private.sessions s WHERE s.principal_id=p.id AND s.expires_at>now()-interval '30 days')
   AND NOT EXISTS(SELECT 1 FROM app_private.rooms r WHERE (r.host_id=p.id OR EXISTS(SELECT 1 FROM app_private.room_members m WHERE m.room_id=r.id AND m.principal_id=p.id AND NOT m.departed)) AND r.state->>'phase' NOT IN ('revealed','cancelled','expired'))
   ORDER BY p.id LIMIT 25 FOR UPDATE OF p SKIP LOCKED`)
    ).rows;
    if (!dryRun) {
      for (const row of rows) {
        await scrubPrincipal(tx, row.id);
        await tx.query(
          "INSERT INTO app_private.deletion_ledger(principal_id,retention_reference,backup_reference) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [row.id, reference, backupReference],
        );
      }
      await tx.query(
        "DELETE FROM app_private.auth_challenges WHERE id IN (SELECT id FROM app_private.auth_challenges WHERE expires_at<now()-interval '1 day' ORDER BY expires_at LIMIT 100)",
      );
      await tx.query(
        "DELETE FROM app_private.sessions WHERE token_hash IN (SELECT token_hash FROM app_private.sessions WHERE expires_at<now()-interval '30 days' ORDER BY expires_at LIMIT 100)",
      );
      await tx.query(
        "DELETE FROM app_private.rate_limits WHERE key IN (SELECT key FROM app_private.rate_limits WHERE expires_at<now()-interval '1 day' ORDER BY expires_at LIMIT 100)",
      );
    }
    return {
      dryRun,
      eligible: rows.length,
      deleted: dryRun ? 0 : rows.length,
      batchLimit: 25,
    };
  });
}
