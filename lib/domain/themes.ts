import type { Sql } from "../db/types";
import type { Theme, Mood } from "../contracts/themes";
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
    slugs.every((s) => rows.some((r) => r.slug === s)),
    400,
    "FILTER_INVALID",
    "Unknown theme filter.",
  );
  assert(
    slugs.every((slug) =>
      rows.some((r) => r.slug === slug && r.status === "enabled"),
    ),
    409,
    "FILTER_UNAVAILABLE",
    "A selected theme is unavailable. Remove it or browse other themes.",
  );
}

export async function moodRegistry(db: Sql): Promise<Mood[]> {
  return (
    await db.query<Mood>(
      "SELECT id,slug,label,status,revision FROM app_private.moods ORDER BY slug",
    )
  ).rows;
}
export async function activeMoods(db: Sql, slugs: string[], lock = false) {
  if (!slugs.length) return;
  const rows = (
    await db.query<{ slug: string; status: string }>(
      "SELECT slug,status FROM app_private.moods WHERE slug=ANY($1::text[]) ORDER BY slug" +
        (lock ? " FOR SHARE" : ""),
      [slugs],
    )
  ).rows;
  assert(
    slugs.every((s) => rows.some((r) => r.slug === s)),
    400,
    "FILTER_INVALID",
    "Unknown mood filter.",
  );
  assert(
    slugs.every((slug) =>
      rows.some((r) => r.slug === slug && r.status === "enabled"),
    ),
    409,
    "FILTER_UNAVAILABLE",
    "A selected mood is unavailable. Remove it or choose another mood.",
  );
}
export async function resolveTheme(db: Sql, slug: string) {
  return (
    await db.query<{ slug: string }>(
      "SELECT slug FROM app_private.themes WHERE slug=$1 UNION ALL SELECT t.slug FROM app_private.theme_aliases a JOIN app_private.themes t ON t.id=a.theme_id WHERE a.slug=$1",
      [slug],
    )
  ).rows[0]?.slug;
}
