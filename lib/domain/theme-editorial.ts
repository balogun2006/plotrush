import type { Database } from "../db/types";
import type { StaffContext } from "./editorial";
import { requireStaff, audit } from "./staff";
import { themeRegistry } from "./themes";
import { publicCases, themeSupply } from "./discovery";
import { themeEditInput } from "../contracts/themes";
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
        "SELECT 1 FROM app_private.playable_versions WHERE content->'discovery'->'themes' ? $1 LIMIT 1",
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
