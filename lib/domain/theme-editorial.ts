import type { Database } from "../db/types";
import type { StaffContext } from "./editorial";
import { requireStaff, audit } from "./staff";
import { themeRegistry, moodRegistry } from "./themes";
import { publicCases, themeSupply } from "./discovery";
import {
  themeEditInput,
  themeCreateInput,
  themeRenameInput,
  moodEditInput,
  moodCreateInput,
} from "../contracts/themes";
import { assert } from "./errors";
export async function listThemeEditorial(db: Database, ctx: StaffContext) {
  return db.transaction(async (tx) => {
    await requireStaff(
      tx,
      ctx.actor,
      ctx.playerToken,
      ctx.staffToken,
      "editorial",
    );
    const all = await publicCases(tx);
    return (await themeRegistry(tx)).map((t) => ({
      ...t,
      ...themeSupply(all, t.slug),
    }));
  });
}
export async function editTheme(
  db: Database,
  ctx: StaffContext,
  slug: string,
  input: unknown,
  publishEnabled: boolean,
) {
  const b = themeEditInput.parse(input);
  return db.transaction(async (tx) => {
    await requireStaff(
      tx,
      ctx.actor,
      ctx.playerToken,
      ctx.staffToken,
      "content_publisher",
    );
    assert(
      publishEnabled,
      503,
      "PUBLISH_DISABLED",
      "Taxonomy publishing is disabled by the publication switch.",
    );
    const r = (
      await tx.query<{ revision: number }>(
        "SELECT revision FROM app_private.themes WHERE slug=$1 FOR UPDATE",
        [slug],
      )
    ).rows[0];
    assert(r, 404, "NOT_FOUND", "Theme unavailable.");
    assert(
      r.revision === b.expectedRevision,
      409,
      "STALE_REVISION",
      "Theme changed. Reload before saving.",
    );
    if (b.status === "retired") {
      const refs = await tx.query(
        "SELECT 1 FROM app_private.playable_versions v JOIN app_private.case_version_themes vt ON vt.case_version_id=v.id JOIN app_private.themes t ON t.id=vt.theme_id WHERE t.slug=$1 LIMIT 1",
        [slug],
      );
      assert(
        !refs.rows.length,
        409,
        "THEME_IN_USE",
        "Withdraw or revise playable cases referencing this theme before retirement.",
      );
      assert(
        !b.promoteOnHome,
        422,
        "THEME_RETIRED",
        "A retired theme cannot be promoted.",
      );
    }
    if (b.promoteOnHome)
      assert(
        themeSupply(await publicCases(tx), slug).ready,
        422,
        "SHELF_NOT_READY",
        "Promotion needs three distinct reviewed playable cases, including a free solo case.",
      );
    await tx.query(
      "UPDATE app_private.themes SET label=$2,description=$3,status=$4,display_order=$5,promote_on_home=$6,revision=revision+1 WHERE slug=$1",
      [slug, b.label, b.description, b.status, b.displayOrder, b.promoteOnHome],
    );
    await audit(tx, ctx.actor, "editorial.theme_updated", slug, {
      revision: r.revision + 1,
      reason: b.reason,
    });
    return (await themeRegistry(tx)).find((t) => t.slug === slug)!;
  });
}

async function publishing(
  tx: import("../db/types").Sql,
  ctx: StaffContext,
  enabled: boolean,
) {
  await requireStaff(
    tx,
    ctx.actor,
    ctx.playerToken,
    ctx.staffToken,
    "content_publisher",
  );
  assert(
    enabled,
    503,
    "PUBLISH_DISABLED",
    "Taxonomy publishing is disabled by the publication switch.",
  );
  await tx.query("SELECT pg_advisory_xact_lock(442713)");
}
export async function createTheme(
  db: Database,
  ctx: StaffContext,
  input: unknown,
  enabled: boolean,
) {
  const b = themeCreateInput.parse(input);
  return db.transaction(async (tx) => {
    await publishing(tx, ctx, enabled);
    const used = await tx.query(
      "SELECT 1 FROM app_private.themes WHERE slug=$1 UNION ALL SELECT 1 FROM app_private.theme_aliases WHERE slug=$1",
      [b.slug],
    );
    assert(
      !used.rows.length,
      409,
      "SLUG_CONFLICT",
      "That theme slug or alias is already reserved.",
    );
    await tx.query(
      "INSERT INTO app_private.themes(slug,label,description,status,display_order) VALUES($1,$2,$3,$4,$5)",
      [b.slug, b.label, b.description, b.status, b.displayOrder],
    );
    await audit(tx, ctx.actor, "editorial.theme_created", b.slug, {
      reason: b.reason,
    });
    return (await themeRegistry(tx)).find((t) => t.slug === b.slug)!;
  });
}
export async function renameTheme(
  db: Database,
  ctx: StaffContext,
  slug: string,
  input: unknown,
  enabled: boolean,
) {
  const b = themeRenameInput.parse(input);
  return db.transaction(async (tx) => {
    await publishing(tx, ctx, enabled);
    const t = (
      await tx.query<{ id: string; revision: number }>(
        "SELECT id,revision FROM app_private.themes WHERE slug=$1 FOR UPDATE",
        [slug],
      )
    ).rows[0];
    assert(t, 404, "NOT_FOUND", "Theme unavailable.");
    assert(
      t.revision === b.expectedRevision,
      409,
      "STALE_REVISION",
      "Theme changed. Reload before saving.",
    );
    const used = await tx.query(
      "SELECT 1 FROM app_private.themes WHERE slug=$1 UNION ALL SELECT 1 FROM app_private.theme_aliases WHERE slug=$1",
      [b.slug],
    );
    assert(
      !used.rows.length,
      409,
      "SLUG_CONFLICT",
      "That theme slug or alias is already reserved.",
    );
    await tx.query("SELECT set_config('plotrush.theme_rename',$1,true)", [
      t.id,
    ]);
    await tx.query(
      "UPDATE app_private.themes SET slug=$2,revision=revision+1 WHERE slug=$1",
      [slug, b.slug],
    );
    await audit(tx, ctx.actor, "editorial.theme_renamed", t.id, {
      from: slug,
      to: b.slug,
      reason: b.reason,
    });
    return (await themeRegistry(tx)).find((x) => x.id === t.id)!;
  });
}
export async function listMoodEditorial(db: Database, ctx: StaffContext) {
  await requireStaff(
    db,
    ctx.actor,
    ctx.playerToken,
    ctx.staffToken,
    "editorial",
  );
  return moodRegistry(db);
}
export async function writeMood(
  db: Database,
  ctx: StaffContext,
  slug: string | null,
  input: unknown,
  enabled: boolean,
) {
  const b = slug ? moodEditInput.parse(input) : moodCreateInput.parse(input);
  return db.transaction(async (tx) => {
    await publishing(tx, ctx, enabled);
    const key = slug ?? (b as import("zod").infer<typeof moodCreateInput>).slug;
    if (slug) {
      const r = (
        await tx.query<{ revision: number }>(
          "SELECT revision FROM app_private.moods WHERE slug=$1 FOR UPDATE",
          [slug],
        )
      ).rows[0];
      assert(r, 404, "NOT_FOUND", "Mood unavailable.");
      assert(
        r.revision ===
          (b as import("zod").infer<typeof moodEditInput>).expectedRevision,
        409,
        "STALE_REVISION",
        "Mood changed. Reload before saving.",
      );
      if (b.status === "retired") {
        const refs = await tx.query(
          "SELECT 1 FROM app_private.playable_versions v JOIN app_private.case_version_moods vm ON vm.case_version_id=v.id JOIN app_private.moods m ON m.id=vm.mood_id WHERE m.slug=$1 LIMIT 1",
          [slug],
        );
        assert(
          !refs.rows.length,
          409,
          "MOOD_IN_USE",
          "Withdraw or revise playable cases using this mood before retirement.",
        );
      }
      await tx.query(
        "UPDATE app_private.moods SET label=$2,status=$3,revision=revision+1 WHERE slug=$1",
        [slug, b.label, b.status],
      );
    } else {
      assert(
        !(
          await tx.query("SELECT 1 FROM app_private.moods WHERE slug=$1", [key])
        ).rows.length,
        409,
        "SLUG_CONFLICT",
        "Mood slug already exists.",
      );
      await tx.query(
        "INSERT INTO app_private.moods(slug,label,status) VALUES($1,$2,$3)",
        [key, b.label, b.status],
      );
    }
    await audit(
      tx,
      ctx.actor,
      slug ? "editorial.mood_updated" : "editorial.mood_created",
      key,
      { reason: b.reason },
    );
    return (await moodRegistry(tx)).find((m) => m.slug === key)!;
  });
}
