import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity, hash } from "../lib/domain/identity";
import { enroll, unlock, requireStaff, StaffRole } from "../lib/domain/staff";
import { totp, seal, unseal, matchingCounter } from "../lib/security/totp";
import * as editorial from "../lib/domain/editorial";
import { catalogue, start, read } from "../lib/domain/game";
import { createRoom, roomAction } from "../lib/domain/rooms";
import { caseSchema, Case } from "../lib/domain/content";
import { editorialCase } from "../lib/contracts/editorial";
let db: Database,
  source: Case,
  editor: editorial.StaffContext,
  publisher: editorial.StaffContext;
const master = "a-test-master-key-with-at-least-32-characters";
const evidence = {
  logic: true,
  accessibility: true,
  rights: true,
  sensitivity: true,
  spoilers: true,
  blindTest: "Synthetic test fixture only; no external blind test claimed.",
  notes: "Synthetic review for automated workflow verification only.",
};
async function person(role?: StaffRole) {
  const who = await createIdentity(db);
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [who.id, randomUUID() + "@example.test"],
  );
  if (role)
    await db.query(
      "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2)",
      [who.id, [role]],
    );
  return who;
}
async function staff(role: StaffRole) {
  const who = await person(role),
    setup = await enroll(db, who.id, who.token, master);
  return {
    actor: who.id,
    playerToken: who.token,
    staffToken: await unlock(
      db,
      who.id,
      who.token,
      totp(setup.secret, Math.floor(Date.now() / 30000)),
      master,
    ),
  };
}
function content(key = "case-" + randomUUID()) {
  return { ...structuredClone(source), key, slug: key };
}
async function publish(c: Case) {
  let d = await editorial.createDraft(db, editor, c);
  d = await editorial.transition(db, editor, d.id, d.revision, "submit");
  d = await editorial.transition(
    db,
    publisher,
    d.id,
    d.revision,
    "approve",
    evidence,
  );
  return editorial.transition(
    db,
    publisher,
    d.id,
    d.revision,
    "publish",
    undefined,
    true,
  );
}
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await migrate(db);
  await seedDrafts(db);
  source = caseSchema.parse(
    (
      await db.query<{ content: Case }>(
        "SELECT content FROM app_private.case_versions WHERE case_key='last-slice' LIMIT 1",
      )
    ).rows[0].content,
  );
  editor = await staff("content_editor");
  publisher = await staff("content_publisher");
}, 30000);
afterAll(async () => db?.close());
it("matches RFC6238 SHA1 vectors, rejects stale/replayed codes and binds encrypted secrets to the account", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  expect(totp(secret, 1)).toBe("287082");
  expect(matchingCounter(secret, "287082", 59000, -1)).toBe(1);
  expect(matchingCounter(secret, "287082", 59000, 1)).toBeNull();
  expect(matchingCounter(secret, "287082", 120000, -1)).toBeNull();
  const cipher = seal(secret, master, "actor");
  expect(cipher).not.toContain(secret);
  expect(unseal(cipher, master, "actor")).toBe(secret);
  expect(() => unseal(cipher, master, "other")).toThrow();
  expect(() => unseal(cipher, master + "other", "actor")).toThrow();
});
it("denies players, missing MFA, cross-session tokens, revoked roles and expired staff sessions", async () => {
  const player = await person(),
    other = await person();
  await expect(
    editorial.listEditorial(db, {
      actor: player.id,
      playerToken: player.token,
      staffToken: editor.staffToken,
    }),
  ).rejects.toMatchObject({ code: "STAFF_DENIED" });
  await expect(
    requireStaff(
      db,
      editor.actor,
      editor.playerToken,
      undefined,
      "content_editor",
    ),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  await expect(
    requireStaff(
      db,
      editor.actor,
      other.token,
      editor.staffToken,
      "content_editor",
    ),
  ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  await expect(
    requireStaff(
      db,
      editor.actor,
      editor.playerToken,
      editor.staffToken,
      "content_publisher",
    ),
  ).rejects.toMatchObject({ code: "ROLE_DENIED" });
  const temporary = await staff("content_editor");
  await db.query(
    "UPDATE app_private.staff_members SET active=false WHERE principal_id=$1",
    [temporary.actor],
  );
  await expect(editorial.templates(db, temporary)).rejects.toMatchObject({
    code: "STAFF_DENIED",
  });
  await db.query(
    "UPDATE app_private.staff_sessions SET expires_at=now() WHERE token_hash=$1",
    [hash(editor.staffToken!)],
  );
  await expect(editorial.listEditorial(db, editor)).rejects.toMatchObject({
    code: "MFA_REQUIRED",
  });
  await db.query(
    "UPDATE app_private.staff_sessions SET expires_at=now()+interval '10 minutes' WHERE token_hash=$1",
    [hash(editor.staffToken!)],
  );
});
it("requires a fresh email session for enrollment, one-time TOTP and bounded failed attempts", async () => {
  const p = await person("content_editor");
  await db.query(
    "UPDATE app_private.sessions SET issued_at=now()-interval '1 hour' WHERE token_hash=$1",
    [hash(p.token)],
  );
  await expect(enroll(db, p.id, p.token, master)).rejects.toMatchObject({
    code: "FRESH_LOGIN_REQUIRED",
  });
  await db.query(
    "UPDATE app_private.sessions SET issued_at=now() WHERE token_hash=$1",
    [hash(p.token)],
  );
  const s = await enroll(db, p.id, p.token, master),
    code = totp(s.secret, Math.floor(Date.now() / 30000));
  await unlock(db, p.id, p.token, code, master);
  await expect(unlock(db, p.id, p.token, code, master)).rejects.toMatchObject({
    code: "MFA_INVALID",
  });
  await expect(enroll(db, p.id, p.token, master)).rejects.toMatchObject({
    code: "MFA_CONFIGURED",
  });
  for (let i = 0; i < 3; i++)
    await expect(
      unlock(db, p.id, p.token, "abcdef", master),
    ).rejects.toMatchObject({ code: "MFA_INVALID" });
  await expect(
    unlock(db, p.id, p.token, "abcdef", master),
  ).rejects.toMatchObject({ status: 429 });
});
it("validates references, hint tiers, eliminations and player bounds before storing any draft", async () => {
  for (const mutate of [
    (c: Case) => {
      c.answer.decisiveClueIds = [];
    },
    (c: Case) => {
      c.rounds[0].hints = [];
    },
    (c: Case) => {
      c.answer.eliminations = {};
    },
    (c: Case) => {
      c.maxPlayers = 10;
    },
    (c: Case) => {
      c.discovery.primaryTheme = "cold-case";
    },
  ]) {
    const c = content();
    mutate(c);
    expect(editorialCase.safeParse(c).success).toBe(false);
  }
  const c = content();
  c.answer.suspectId = "missing";
  await expect(editorial.createDraft(db, editor, c)).rejects.toThrow();
});
it("keeps private drafts out of catalogue and direct starts, rejects stale concurrent edits and freezes review", async () => {
  let d = await editorial.createDraft(db, editor, content());
  expect((await catalogue(db)).some((x) => x.id === d.case_key)).toBe(false);
  const player = await createIdentity(db);
  await expect(start(db, player.id, d.case_key)).rejects.toMatchObject({
    status: 404,
  });
  const edits = await Promise.allSettled([
    editorial.saveDraft(db, editor, d.id, d.revision, {
      ...d.content,
      title: "First revision",
    }),
    editorial.saveDraft(db, editor, d.id, d.revision, {
      ...d.content,
      title: "Second revision",
    }),
  ]);
  expect(edits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  d = await editorial.readDraft(db, editor, d.id);
  d = await editorial.transition(db, editor, d.id, d.revision, "submit");
  await expect(
    editorial.saveDraft(db, editor, d.id, d.revision, d.content),
  ).rejects.toMatchObject({ code: "DRAFT_LOCKED" });
});
it("requires independent publisher approval, a complete review and an explicit publication switch", async () => {
  const admin = await staff("admin");
  let d = await editorial.createDraft(db, admin, content());
  d = await editorial.saveDraft(db, editor, d.id, d.revision, {
    ...d.content,
    title: "A different last editor changed this author’s draft",
  });
  d = await editorial.transition(db, admin, d.id, d.revision, "submit");
  await expect(
    editorial.transition(db, admin, d.id, d.revision, "approve", evidence),
  ).rejects.toMatchObject({ code: "INDEPENDENT_REVIEW_REQUIRED" });
  await expect(
    editorial.transition(db, editor, d.id, d.revision, "approve", evidence),
  ).rejects.toMatchObject({ code: "ROLE_DENIED" });
  await expect(
    editorial.transition(
      db,
      publisher,
      d.id,
      d.revision,
      "publish",
      undefined,
      true,
    ),
  ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  await expect(
    editorial.transition(db, publisher, d.id, d.revision, "approve", {
      logic: true,
    }),
  ).rejects.toThrow();
  d = await editorial.transition(
    db,
    publisher,
    d.id,
    d.revision,
    "approve",
    evidence,
  );
  await expect(
    editorial.transition(db, publisher, d.id, d.revision, "publish"),
  ).rejects.toMatchObject({ code: "PUBLISH_DISABLED" });
  d = await editorial.transition(db, publisher, d.id, d.revision, "return");
  expect(d.state).toBe("draft");
  expect(d.review).toBeNull();
});
it("publishes immutable versions, preserves existing solo games and withdraws new starts without fixture fallback", async () => {
  const c = content(),
    player = await createIdentity(db);
  const d = await publish(c),
    old = await start(db, player.id, c.key);
  let revised = await editorial.transition(
    db,
    editor,
    d.id,
    d.revision,
    "revise",
  );
  revised = await editorial.saveDraft(
    db,
    editor,
    revised.id,
    revised.revision,
    { ...revised.content, title: "Updated title" },
  );
  revised = await editorial.transition(
    db,
    editor,
    revised.id,
    revised.revision,
    "submit",
  );
  revised = await editorial.transition(
    db,
    publisher,
    revised.id,
    revised.revision,
    "approve",
    evidence,
  );
  await editorial.transition(
    db,
    publisher,
    revised.id,
    revised.revision,
    "publish",
    undefined,
    true,
  );
  expect((await read(db, player.id, old.id)).title).toBe(c.title);
  expect((await start(db, (await createIdentity(db)).id, c.key)).title).toBe(
    "Updated title",
  );
  await expect(
    db.query("UPDATE app_private.case_versions SET content='{}' WHERE id=$1", [
      d.version_id,
    ]),
  ).rejects.toThrow();
  await editorial.unpublish(
    db,
    publisher,
    c.key,
    "Synthetic automated withdrawal check.",
  );
  await expect(start(db, player.id, c.key)).rejects.toMatchObject({
    status: 404,
  });
  expect((await read(db, player.id, old.id)).title).toBe(c.title);
  // Publishing a fixture and withdrawing it must not resurrect the draft fallback.
  await publish(structuredClone(source));
  await editorial.unpublish(
    db,
    publisher,
    source.key,
    "Synthetic fixture fallback withdrawal.",
  );
  expect((await catalogue(db)).some((x) => x.id === source.key)).toBe(false);
});
it("pins group lobbies to their release version when an editor publishes another version", async () => {
  const sourceGroup = caseSchema.parse(
      (
        await db.query<{ content: Case }>(
          "SELECT content FROM app_private.case_versions WHERE case_key='missing-mic' LIMIT 1",
        )
      ).rows[0].content,
    ),
    key = "group-" + randomUUID(),
    c = { ...sourceGroup, key, slug: key };
  await publish(c);
  const host = await createIdentity(db),
    r = await createRoom(db, host.id, key, "Host");
  await publish({ ...c, title: "Replacement group title" });
  expect(
    (
      await roomAction(db, host.id, r.room.id, "heartbeat", {
        expectedVersion: r.room.stateVersion,
      })
    ).title,
  ).toBe(c.title);
});
it("schedules published free minis in UTC, rejects paid/unreleased cases, reports queue gaps and records audit without solutions", async () => {
  const d = await publish(content()),
    day = new Date().toISOString().slice(0, 10);
  await editorial.schedule(db, publisher, day, d.version_id!, true);
  const s = await editorial.listEditorial(db, publisher);
  expect(
    s.calendar.some((x: unknown) => (x as { day: string }).day === day),
  ).toBe(true);
  expect(s.queueGaps.length).toBe(6);
  await expect(
    editorial.schedule(db, editor, day, d.version_id!, true),
  ).rejects.toMatchObject({ code: "ROLE_DENIED" });
  await expect(
    editorial.schedule(db, publisher, "2000-01-01", d.version_id!, true),
  ).rejects.toMatchObject({ code: "SCHEDULE_RANGE" });
  await expect(
    editorial.schedule(db, publisher, day, "missing", true),
  ).rejects.toMatchObject({ code: "PUBLISHED_VERSION_REQUIRED" });
  const log = JSON.stringify(await editorial.editorialAudit(db, editor));
  expect(log).toContain("editorial.scheduled");
  expect(log).not.toContain(source.answer.explanation);
});
