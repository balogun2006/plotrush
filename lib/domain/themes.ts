import type { Sql } from "../db/types";
import type { Theme } from "../contracts/themes";
import { assert } from "./errors";
export async function themeRegistry(db: Sql): Promise<Theme[]> {
  return (
    await db.query<Theme>(
      'SELECT id,slug,label,description,status,display_order AS "displayOrder",promote_on_home AS "promoteOnHome",revision FROM app_private.themes ORDER BY display_order,slug',
    )
  ).rows;
}
export async function activeThemes(db: Sql, slugs: string[], lock = false) {
  if (!slugs.length) return;
  const rows = (
    await db.query<{ slug: string; status: string }>(
      "SELECT slug,status FROM app_private.themes WHERE slug=ANY($1::text[]) ORDER BY slug" +
        (lock ? " FOR SHARE" : ""),
      [slugs],
    )
  ).rows;
  assert(
    slugs.every((slug) =>
      rows.some((r) => r.slug === slug && r.status === "enabled"),
    ),
    409,
    "FILTER_UNAVAILABLE",
    "A selected theme is unavailable. Remove it or browse other themes.",
  );
}
