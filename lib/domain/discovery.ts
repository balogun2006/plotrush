import type { Database, Sql } from "../db/types";
import { catalogue } from "./game";
import { filterCases, facets, parseFilters, type Filters } from "./catalogue";
import { activeThemes, themeRegistry } from "./themes";
import { assert } from "./errors";
import type { CaseCard } from "./content";
export async function publicCases(db: Sql) {
  return (await catalogue(db))
    .filter(
      (c) =>
        c.access === "free" &&
        (c.modes.includes("solo") || c.kind === "tutorial"),
    )
    .map((c) => {
      const modes = c.modes.filter(
        (m) => m === "solo" || c.kind === "tutorial",
      );
      return {
        ...c,
        modes,
        discovery: {
          ...c.discovery,
          estimatedDurationMinutes: {
            ...(modes.includes("solo")
              ? { solo: c.discovery.estimatedDurationMinutes.solo }
              : {}),
            ...(modes.includes("group")
              ? { group: c.discovery.estimatedDurationMinutes.group }
              : {}),
          },
        },
      };
    });
}
export function themeSupply(cases: CaseCard[], slug: string) {
  const reviewed = cases.filter(
    (c) =>
      c.firstPublishedAt &&
      c.discovery.themes.includes(slug as (typeof c.discovery.themes)[number]),
  );
  return {
    reviewedCount: reviewed.length,
    ready:
      reviewed.length >= 3 &&
      reviewed.some((c) => c.access === "free" && c.modes.includes("solo")),
  };
}
export async function discoverySnapshot(db: Database, params: URLSearchParams) {
  const f = parseFilters(params);
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await activeThemes(tx, f.themes);
    const all = await publicCases(tx),
      registry = await themeRegistry(tx);
    return {
      cases: filterCases(all, f),
      facets: facets(all, f),
      filters: f,
      preview: true,
      themes: registry.map((t) => {
        const count =
          t.status === "enabled"
            ? filterCases(all, { ...f, themes: [t.slug] }).length
            : 0;
        const supply = themeSupply(all, t.slug);
        return {
          ...t,
          count,
          ...supply,
          promoted:
            t.status === "enabled" &&
            count > 0 &&
            t.promoteOnHome &&
            supply.ready,
        };
      }),
    };
  });
}
export async function themePage(db: Database, slug: string, filters: Filters) {
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const registry = await themeRegistry(tx),
      theme = registry.find((t) => t.slug === slug);
    assert(theme, 404, "NOT_FOUND", "Unknown mystery theme.");
    const all = await publicCases(tx);
    const cases =
      theme.status === "enabled"
        ? filterCases(all, { ...filters, themes: [slug] })
        : [];
    const alternatives = registry
      .filter((t) => t.status === "enabled" && t.slug !== slug)
      .map((t) => ({
        ...t,
        count: filterCases(all, { ...filters, themes: [t.slug] }).length,
      }))
      .filter((t) => t.count > 0);
    return { theme, cases, alternatives };
  });
}
