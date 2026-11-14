import { createHash } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { catalogue } from "./game";
import { filterCases, facets, parseFilters, type Filters } from "./catalogue";
import {
  activeThemes,
  activeMoods,
  themeRegistry,
  moodRegistry,
} from "./themes";
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
  const fp = new URLSearchParams(params);
  const limitText = fp.get("limit") ?? "24",
    cursor = fp.get("cursor");
  assert(
    fp.getAll("limit").length <= 1 &&
      fp.getAll("cursor").length <= 1 &&
      /^(?:[1-9]|[1-4][0-9]|50)$/.test(limitText) &&
      params.toString().length <= 2048,
    400,
    "FILTER_INVALID",
    "Choose a page size from 1 to 50 and one valid cursor.",
  );
  fp.delete("limit");
  fp.delete("cursor");
  const f = parseFilters(fp),
    limit = Number(limitText);
  const filterHash = createHash("sha256")
    .update(JSON.stringify({ f, limit, market: "preview" }))
    .digest("hex");
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await activeThemes(tx, f.themes);
    await activeMoods(tx, f.moods);
    const all = await publicCases(tx),
      registry = await themeRegistry(tx),
      moods = await moodRegistry(tx);
    const revision = String(
      (
        await tx.query<{ revision: string }>(
          "SELECT revision FROM app_private.catalogue_revisions WHERE id=1",
        )
      ).rows[0].revision,
    );
    const filtered = filterCases(all, f);
    let start = 0;
    if (cursor) {
      let value: { hash: string; revision: string; last: string } | undefined;
      try {
        value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      } catch {}
      assert(
        value &&
          value.hash === filterHash &&
          typeof value.last === "string" &&
          typeof value.revision === "string",
        400,
        "CURSOR_INVALID",
        "This page does not belong to these filters. Start again.",
      );
      assert(
        value.revision === revision,
        409,
        "CURSOR_STALE",
        "The catalogue changed. Restart browsing to see the current cases.",
      );
      start =
        filtered.findIndex((c) => (c.caseUuid ?? c.id) === value.last) + 1;
      assert(
        start > 0,
        400,
        "CURSOR_INVALID",
        "Page position is invalid. Start again.",
      );
    }
    const page = filtered.slice(start, start + limit),
      last = page.at(-1);
    const nextCursor =
      start + limit < filtered.length && last
        ? Buffer.from(
            JSON.stringify({
              hash: filterHash,
              revision,
              last: last.caseUuid ?? last.id,
            }),
          ).toString("base64url")
        : null;
    return {
      cases: page,
      total: filtered.length,
      nextCursor,
      revision,
      facets: facets(
        all,
        f,
        registry.filter((t) => t.status === "enabled").map((t) => t.slug),
        moods.filter((m) => m.status === "enabled").map((m) => m.slug),
      ),
      moods,
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
