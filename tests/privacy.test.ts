import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import {
  createIdentity,
  saveInterests,
  identity,
  hash,
  interests,
} from "../lib/domain/identity";
import {
  requestPrivacy,
  cancelDeletion,
  exportAccount,
  reviewDeletion,
  privacyQueue,
  deletionLedger,
  replayDeletionLedger,
  retentionSweep,
} from "../lib/domain/privacy";
import { requestCode, verifyCode } from "../lib/domain/accounts";
import { start } from "../lib/domain/game";
import { createRoom, joinRoom } from "../lib/domain/rooms";
import { enroll, unlock, type StaffRole } from "../lib/domain/staff";
import { totp } from "../lib/security/totp";
import type { StaffContext } from "../lib/domain/editorial";
let db: Database, admin: StaffContext, finance: StaffContext;
const secret = "privacy-test-secret-with-more-than32characters";
async function verified() {
  const who = await createIdentity(db);
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [who.id, randomUUID() + "@example.test"],
  );
  return who;
}
async function staff(role: StaffRole) {
  const who = await verified();
  await db.query(
    "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2)",
    [who.id, [role]],
  );
  const setup = await enroll(db, who.id, who.token, secret);
  return {
    actor: who.id,
    playerToken: who.token,
    staffToken: await unlock(
      db,
      who.id,
      who.token,
      totp(setup.secret, Math.floor(Date.now() / 30000)),
      secret,
    ),
  };
}
const review = (revision = 1, decision = "complete") => ({
  expectedRevision: revision,
  decision,
  reason: "Synthetic privacy fulfilment test only.",
  retentionReference: "Synthetic reviewed retention reference.",
  backupReference: "Synthetic recovery-ledger replay reference.",
  retentionReviewed: true,
});
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
  admin = await staff("admin");
  finance = await staff("finance");
}, 30000);
afterAll(async () => db?.close());
it("requires a recently verified owner and prevents cross-user export", async () => {
  const guest = await createIdentity(db);
  await expect(
    requestPrivacy(db, guest.id, guest.token, "export"),
  ).rejects.toMatchObject({ status: 403 });
  const who = await verified();
  await db.query(
    "UPDATE app_private.sessions SET issued_at=now()-interval '11 minutes' WHERE principal_id=$1",
    [who.id],
  );
  await expect(
    requestPrivacy(db, who.id, who.token, "export"),
  ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  await db.query(
    "UPDATE app_private.sessions SET issued_at=now() WHERE principal_id=$1",
    [who.id],
  );
  const request = await requestPrivacy(db, who.id, who.token, "export");
  const other = await verified();
  await expect(
    exportAccount(db, other.id, other.token, request.id),
  ).rejects.toMatchObject({ status: 404 });
});
it("exports owner preferences and notes without private case canon or another player's data", async () => {
  const who = await verified(),
    other = await verified();
  await saveInterests(db, who.id, ["everyday-mystery"], 0, {
    moods: ["lighthearted"],
  });
  const attempt = await start(db, who.id, "last-slice"),
    outside = await start(db, other.id, "wrong-parcel");
  await db.query("UPDATE app_private.attempts SET notes=$2 WHERE id=$1", [
    attempt.id,
    "Owner-only exported notes",
  ]);
  await db.query("UPDATE app_private.attempts SET notes=$2 WHERE id=$1", [
    outside.id,
    "Never export another player's note",
  ]);
  const r = await requestPrivacy(db, who.id, who.token, "export"),
    data = await exportAccount(db, who.id, who.token, r.id);
  expect(data.preferences.themeIds).toHaveLength(1);
  expect(data.investigations).toHaveLength(1);
  expect(JSON.stringify(data)).toContain("Owner-only exported notes");
  expect(JSON.stringify(data)).not.toContain("Never export another");
  expect(JSON.stringify(data)).not.toMatch(
    /decisiveClueIds|eliminations|code_hash|token_hash/,
  );
  expect(await requestPrivacy(db, who.id, who.token, "export")).toMatchObject({
    id: r.id,
  });
});
it("serialises duplicate deletion requests and protects revisioned cancellation", async () => {
  const who = await verified(),
    rs = await Promise.all([
      requestPrivacy(db, who.id, who.token, "deletion"),
      requestPrivacy(db, who.id, who.token, "deletion"),
    ]);
  expect(rs[0].id).toBe(rs[1].id);
  const other = await verified();
  await expect(
    cancelDeletion(db, other.id, other.token, rs[0].id, 1),
  ).rejects.toMatchObject({ status: 409 });
  const deferred = await reviewDeletion(
    db,
    admin,
    rs[0].id,
    review(1, "defer"),
  );
  expect(deferred.state).toBe("deferred");
  await expect(
    cancelDeletion(db, who.id, who.token, rs[0].id, 1),
  ).rejects.toMatchObject({ status: 409 });
  expect((await cancelDeletion(db, who.id, who.token, rs[0].id, 2)).state).toBe(
    "cancelled",
  );
  expect(await identity(db, who.token)).toBe(who.id);
});
it("denies finance, stale MFA, active games, financial records and missing retention review", async () => {
  const who = await verified(),
    r = await requestPrivacy(db, who.id, who.token, "deletion");
  await expect(
    reviewDeletion(db, finance, r.id, review()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(privacyQueue(db, finance)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    reviewDeletion(db, { ...admin, staffToken: undefined }, r.id, review()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    reviewDeletion(db, admin, r.id, { ...review(), retentionReviewed: false }),
  ).rejects.toThrow();
  await createRoom(db, who.id, "missing-mic", "Privacy player");
  await expect(reviewDeletion(db, admin, r.id, review())).rejects.toMatchObject(
    { code: "DELETION_BLOCKED" },
  );
  const buyer = await verified(),
    b = await requestPrivacy(db, buyer.id, buyer.token, "deletion");
  await db.query(
    "INSERT INTO app_private.orders(id,buyer_id,product_id,price_version_id,amount_minor,currency,environment,idempotency_key) VALUES($1,$2,'wedding-gift-solo','demo-wedding-solo-ngn-v1',200000,'NGN','development',$3)",
    [randomUUID(), buyer.id, randomUUID()],
  );
  await expect(reviewDeletion(db, admin, b.id, review())).rejects.toMatchObject(
    { code: "DELETION_BLOCKED" },
  );
  expect(await identity(db, buyer.token)).toBe(buyer.id);
  const queue = await privacyQueue(db, admin);
  expect(queue.find((x) => x.id === b.id)?.blockers).toContain(
    "financial_records",
  );
  expect(JSON.stringify(queue)).not.toContain("@example.test");
});
it("erases eligible owner data, revokes sessions, preserves other players and records a replayable tombstone", async () => {
  const who = await verified(),
    other = await verified();
  await saveInterests(db, who.id, ["everyday-mystery"], 0);
  await start(db, who.id, "last-slice");
  const outside = await start(db, other.id, "wrong-parcel");
  const group = await createRoom(db, who.id, "missing-mic", "Private owner");
  await joinRoom(db, other.id, group.inviteCode, "Other player");
  await db.query(
    "UPDATE app_private.rooms SET state=jsonb_set(jsonb_set(state,'{phase}','\"revealed\"'::jsonb),'{votes}',$2::jsonb) WHERE id=$1",
    [
      group.room.id,
      JSON.stringify({
        [who.id]: { suspectId: "owner-choice" },
        [other.id]: { suspectId: "other-choice" },
      }),
    ],
  );
  await db.query(
    "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,ARRAY['content_editor'])",
    [who.id],
  );
  await enroll(db, who.id, who.token, secret);
  await db.query(
    "UPDATE app_private.staff_members SET active=false WHERE principal_id=$1",
    [who.id],
  );
  const r = await requestPrivacy(db, who.id, who.token, "deletion"),
    outcomes = await Promise.allSettled([
      reviewDeletion(db, admin, r.id, review()),
      reviewDeletion(db, admin, r.id, review()),
    ]);
  expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(await identity(db, who.token)).toBeNull();
  expect((await interests(db, who.id)).themes).toEqual([]);
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.attempts WHERE principal_id=$1",
        [who.id],
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await db.query("SELECT 1 FROM app_private.attempts WHERE id=$1", [
        outside.id,
      ])
    ).rows,
  ).toHaveLength(1);
  const votes = (
    await db.query<{ votes: Record<string, unknown> }>(
      "SELECT state->'votes' AS votes FROM app_private.rooms WHERE id=$1",
      [group.room.id],
    )
  ).rows[0].votes;
  expect(votes[who.id]).toBeUndefined();
  expect(votes[other.id]).toEqual({ suspectId: "other-choice" });
  expect(
    (
      await db.query(
        "SELECT nickname FROM app_private.room_members WHERE room_id=$1 AND principal_id=$2",
        [group.room.id, who.id],
      )
    ).rows[0],
  ).toMatchObject({ nickname: "Deleted player" });
  expect(
    (
      await db.query(
        "SELECT secret_cipher,pending_cipher FROM app_private.staff_members WHERE principal_id=$1",
        [who.id],
      )
    ).rows[0],
  ).toEqual({ secret_cipher: null, pending_cipher: null });
  const ledger = await deletionLedger(db, admin);
  expect(JSON.stringify(ledger)).not.toMatch(/@example.test|notes|themes/);
  // Simulate restoring an older account row/session; replay before opening it.
  await db.query(
    "UPDATE app_private.principals SET deleted_at=NULL WHERE id=$1",
    [who.id],
  );
  await db.query(
    "INSERT INTO app_private.sessions(token_hash,principal_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
    [hash(who.token), who.id],
  );
  expect(await identity(db, who.token)).toBe(who.id);
  await replayDeletionLedger(db, ledger);
  expect(await identity(db, who.token)).toBeNull();
  await replayDeletionLedger(db, ledger);
});
it("retention defaults to a dry run and excludes active, verified and purchasing identities", async () => {
  const expired = await createIdentity(db),
    active = await createIdentity(db),
    permanent = await verified();
  await db.query(
    "UPDATE app_private.principals SET created_at=now()-interval '100 days' WHERE id=ANY($1::uuid[])",
    [[expired.id, active.id, permanent.id]],
  );
  await db.query(
    "UPDATE app_private.sessions SET expires_at=now()-interval '40 days' WHERE principal_id=$1",
    [expired.id],
  );
  const preview = await retentionSweep(db, "", "");
  expect(preview.eligible).toBe(1);
  expect(preview.deleted).toBe(0);
  await expect(retentionSweep(db, "", "", false)).rejects.toMatchObject({
    code: "POLICY_REQUIRED",
  });
  expect(
    (
      await retentionSweep(
        db,
        "Synthetic reviewed retention basis",
        "Synthetic backup process reference",
        false,
      )
    ).deleted,
  ).toBe(1);
  expect(await identity(db, active.token)).toBe(active.id);
  expect(await identity(db, permanent.token)).toBe(permanent.id);
});

it("serialises administrator re-verification with deletion review", async () => {
  const reviewer = await staff("admin"),
    who = await verified(),
    r = await requestPrivacy(db, who.id, who.token, "deletion");
  const email = (
    await db.query<{ email: string }>(
      "SELECT email FROM app_private.accounts WHERE principal_id=$1",
      [reviewer.actor],
    )
  ).rows[0].email;
  let code = "";
  const challenge = await requestCode(db, reviewer.actor, email, secret, {
    send: async (message) => {
      code = message.code;
    },
  });
  const results = await Promise.allSettled([
    reviewDeletion(db, reviewer, r.id, review()),
    verifyCode(db, reviewer.actor, challenge.challengeId, code, secret),
  ]);
  expect(results[1].status).toBe("fulfilled");
  if (results[0].status === "rejected")
    expect(results[0].reason).toMatchObject({ status: 403 });
  else expect(results[0].value.state).toBe("completed");
  expect(
    (
      await db.query(
        "SELECT 1 FROM app_private.audit_events WHERE entity_id=$1 AND action='privacy.deletion_completed'",
        [r.id],
      )
    ).rows.length,
  ).toBeLessThanOrEqual(1);
});
