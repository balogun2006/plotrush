import { randomUUID, createHash } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { assert } from "./errors";
import { requireStaff, audit, StaffRole } from "./staff";
import { editorialCase, reviewInput } from "../contracts/editorial";
import type { Case } from "./content";
export type StaffContext = {
  actor: string;
  playerToken: string;
  staffToken: string | undefined;
};
export type Draft = {
  id: string;
  case_key: string;
  content: Case;
  revision: number;
  state: string;
  editor_id: string;
  author_id: string;
  approved_by: string | null;
  review: unknown;
  version_id: string | null;
};
async function permission(
  tx: Sql,
  ctx: StaffContext,
  role: StaffRole | "read",
) {
  return requireStaff(tx, ctx.actor, ctx.playerToken, ctx.staffToken, role);
}
async function draft(tx: Sql, id: string) {
  const d = (
    await tx.query<Draft>(
      "SELECT * FROM app_private.editorial_drafts WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  assert(d, 404, "NOT_FOUND", "Draft unavailable.");
  return d;
}
function revision(d: Draft, n: number) {
  assert(
    d.revision === n,
    409,
    "STALE_REVISION",
    "This draft changed. Reload before saving.",
  );
}
export async function listEditorial(db: Database, ctx: StaffContext) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "read");
    const drafts = (
      await tx.query(
        "SELECT id,case_key,content->>'title' AS title,state,revision,updated_at,version_id FROM app_private.editorial_drafts ORDER BY updated_at DESC,id LIMIT 100",
      )
    ).rows;
    const releases = (
      await tx.query(
        "SELECT r.case_key,r.version_id,r.enabled,r.published_at,v.content->>'title' AS title FROM app_private.case_releases r JOIN app_private.case_versions v ON v.id=r.version_id ORDER BY r.case_key",
      )
    ).rows;
    const calendar = (
      await tx.query(
        "SELECT c.day::text,c.version_id,v.content->>'title' AS title FROM app_private.daily_calendar c JOIN app_private.case_versions v ON v.id=c.version_id WHERE c.day>=timezone('UTC',now())::date ORDER BY c.day LIMIT 60",
      )
    ).rows;
    const gaps = (
      await tx.query(
        "SELECT slots.day::date::text AS day FROM generate_series(timezone('UTC',now())::date,timezone('UTC',now())::date+6,interval '1 day') AS slots(day) WHERE NOT EXISTS(SELECT 1 FROM app_private.daily_calendar c JOIN app_private.case_versions v ON v.id=c.version_id JOIN app_private.case_releases r ON r.case_key=v.case_key WHERE c.day=slots.day::date AND r.enabled) ORDER BY slots.day",
      )
    ).rows;
    return { drafts, releases, calendar, queueGaps: gaps };
  });
}
export async function readDraft(db: Database, ctx: StaffContext, id: string) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "read");
    return draft(tx, id);
  });
}
export async function templates(db: Database, ctx: StaffContext) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "read");
    return (
      await tx.query(
        "SELECT v.id,v.content FROM app_private.preview_fixtures f JOIN app_private.case_versions v ON v.id=f.version_id ORDER BY v.case_key",
      )
    ).rows;
  });
}
export async function createDraft(
  db: Database,
  ctx: StaffContext,
  content: Case,
) {
  content = editorialCase.parse(content);
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "content_editor");
    const id = randomUUID();
    await tx.query(
      "INSERT INTO app_private.editorial_drafts(id,case_key,content,editor_id,author_id) VALUES($1,$2,$3,$4,$4)",
      [id, content.key, JSON.stringify(content), ctx.actor],
    );
    await audit(tx, ctx.actor, "editorial.created", id, {
      caseKey: content.key,
    });
    return draft(tx, id);
  });
}
export async function saveDraft(
  db: Database,
  ctx: StaffContext,
  id: string,
  expected: number,
  content: Case,
) {
  content = editorialCase.parse(content);
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "content_editor");
    const d = await draft(tx, id);
    revision(d, expected);
    assert(
      d.state === "draft",
      409,
      "DRAFT_LOCKED",
      "Return the case to draft before editing; published versions require a new draft.",
    );
    assert(
      content.key === d.case_key,
      422,
      "CASE_KEY_IMMUTABLE",
      "A case key cannot change within a draft.",
    );
    await tx.query(
      "UPDATE app_private.editorial_drafts SET content=$2,revision=revision+1,editor_id=$3,approved_by=NULL,review=NULL,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(content), ctx.actor],
    );
    await audit(tx, ctx.actor, "editorial.saved", id, {
      revision: expected + 1,
    });
    return draft(tx, id);
  });
}
export async function transition(
  db: Database,
  ctx: StaffContext,
  id: string,
  expected: number,
  action: "submit" | "return" | "approve" | "publish" | "revise",
  review?: unknown,
  publishEnabled = false,
) {
  return db.transaction(async (tx) => {
    await permission(
      tx,
      ctx,
      ["approve", "publish", "return"].includes(action)
        ? "content_publisher"
        : "content_editor",
    );
    const d = await draft(tx, id);
    revision(d, expected);
    if (action === "revise") {
      assert(
        d.state === "published",
        409,
        "INVALID_STATE",
        "Only published cases need a new revision.",
      );
      const newid = randomUUID();
      await tx.query(
        "INSERT INTO app_private.editorial_drafts(id,case_key,content,editor_id,author_id) VALUES($1,$2,$3,$4,$4)",
        [newid, d.case_key, JSON.stringify(d.content), ctx.actor],
      );
      await audit(tx, ctx.actor, "editorial.revised", newid, {
        sourceDraft: id,
      });
      return draft(tx, newid);
    }
    if (action === "submit") {
      assert(
        d.state === "draft",
        409,
        "INVALID_STATE",
        "Only drafts can enter review.",
      );
      editorialCase.parse(d.content);
      await tx.query(
        "UPDATE app_private.editorial_drafts SET state='review',revision=revision+1,updated_at=now() WHERE id=$1",
        [id],
      );
    }
    if (action === "return") {
      assert(
        ["review", "approved"].includes(d.state),
        409,
        "INVALID_STATE",
        "Only reviewed cases can return to draft.",
      );
      await tx.query(
        "UPDATE app_private.editorial_drafts SET state='draft',approved_by=NULL,review=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
        [id],
      );
    }
    if (action === "approve") {
      assert(
        d.state === "review",
        409,
        "INVALID_STATE",
        "Submit this draft for review first.",
      );
      assert(
        d.editor_id !== ctx.actor && d.author_id !== ctx.actor,
        403,
        "INDEPENDENT_REVIEW_REQUIRED",
        "A different publisher must review the author’s and last editor’s work.",
      );
      assert(
        review,
        422,
        "REVIEW_REQUIRED",
        "Complete the review checklist and blind-test evidence.",
      );
      await tx.query(
        "UPDATE app_private.editorial_drafts SET state='approved',approved_by=$2,review=$3,revision=revision+1,updated_at=now() WHERE id=$1",
        [id, ctx.actor, JSON.stringify(reviewInput.shape.review.parse(review))],
      );
    }
    if (action === "publish") {
      assert(
        publishEnabled,
        503,
        "PUBLISH_DISABLED",
        "Public publishing is disabled by the deployment switch.",
      );
      assert(
        d.state === "approved" && d.approved_by && d.review,
        409,
        "APPROVAL_REQUIRED",
        "Independent approval is required.",
      );
      const c = editorialCase.parse(d.content),
        json = JSON.stringify(c),
        checksum = createHash("sha256").update(json).digest("hex"),
        versionId = c.key + ":" + checksum;
      await tx.query("SELECT pg_advisory_xact_lock(442712)");
      const slug = await tx.query(
        "SELECT 1 FROM app_private.case_releases r JOIN app_private.case_versions v ON v.id=r.version_id WHERE r.case_key<>$1 AND v.content->>'slug'=$2",
        [c.key, c.slug],
      );
      assert(
        !slug.rows.length,
        409,
        "SLUG_CONFLICT",
        "Another published case already uses this slug.",
      );
      await tx.query(
        "INSERT INTO app_private.case_versions(id,case_key,checksum,content,status) VALUES($1,$2,$3,$4,'published') ON CONFLICT(case_key,checksum) DO NOTHING",
        [versionId, c.key, checksum, json],
      );
      const v = (
        await tx.query<{ id: string }>(
          "SELECT id FROM app_private.case_versions WHERE case_key=$1 AND checksum=$2",
          [c.key, checksum],
        )
      ).rows[0];
      await tx.query(
        "UPDATE app_private.case_versions SET status='published' WHERE id=$1",
        [v.id],
      );
      await tx.query(
        "INSERT INTO app_private.case_releases(case_key,version_id,published_by) VALUES($1,$2,$3) ON CONFLICT(case_key) DO UPDATE SET version_id=excluded.version_id,enabled=true,published_by=excluded.published_by,published_at=now()",
        [c.key, v.id, ctx.actor],
      );
      await tx.query(
        "UPDATE app_private.editorial_drafts SET state='published',version_id=$2,revision=revision+1,updated_at=now() WHERE id=$1",
        [id, v.id],
      );
    }
    await audit(tx, ctx.actor, "editorial." + action, id, {
      revision: expected + 1,
    });
    return draft(tx, id);
  });
}
export async function unpublish(
  db: Database,
  ctx: StaffContext,
  key: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "content_publisher");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "publication:" + key,
    ]);
    const r = await tx.query(
      "UPDATE app_private.case_releases SET enabled=false WHERE case_key=$1 RETURNING case_key",
      [key],
    );
    assert(r.rows.length, 404, "NOT_FOUND", "Published case unavailable.");
    await audit(tx, ctx.actor, "editorial.unpublished", key, { reason });
    return { caseKey: key, enabled: false };
  });
}
export async function schedule(
  db: Database,
  ctx: StaffContext,
  day: string,
  versionId: string,
  publishEnabled: boolean,
) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "content_publisher");
    assert(
      publishEnabled,
      503,
      "PUBLISH_DISABLED",
      "Publishing and scheduling are disabled.",
    );
    const r = (
      await tx.query<{ content: Case }>(
        "SELECT v.content FROM app_private.case_versions v JOIN app_private.case_releases r ON r.version_id=v.id AND r.enabled WHERE v.id=$1 AND v.status='published'",
        [versionId],
      )
    ).rows[0];
    assert(
      r,
      422,
      "PUBLISHED_VERSION_REQUIRED",
      "Select a currently released version.",
    );
    const c = editorialCase.parse(r.content);
    assert(
      c.access === "free" && c.kind === "mini" && c.modes.includes("solo"),
      422,
      "DAILY_CASE_REQUIRED",
      "Daily slots require a free solo mini case.",
    );
    const valid = await tx.query(
      "SELECT 1 WHERE $1::date BETWEEN timezone('UTC',now())::date AND timezone('UTC',now())::date+90",
      [day],
    );
    assert(
      valid.rows.length,
      422,
      "SCHEDULE_RANGE",
      "Schedule within the next 90 UTC days.",
    );
    await tx.query(
      "INSERT INTO app_private.daily_calendar(day,version_id,scheduled_by) VALUES($1,$2,$3) ON CONFLICT(day) DO UPDATE SET version_id=excluded.version_id,scheduled_by=excluded.scheduled_by,updated_at=now()",
      [day, versionId, ctx.actor],
    );
    await audit(tx, ctx.actor, "editorial.scheduled", versionId, { day });
    return { day, versionId };
  });
}
export async function editorialAudit(db: Database, ctx: StaffContext) {
  return db.transaction(async (tx) => {
    await permission(tx, ctx, "read");
    return (
      await tx.query(
        "SELECT id,actor_id,action,entity_id,created_at FROM app_private.audit_events WHERE action LIKE 'editorial.%' ORDER BY created_at DESC,id LIMIT 100",
      )
    ).rows;
  });
}
