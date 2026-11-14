import type { Sql } from "../db/types";
import { catalogue } from "./game";
import { interests } from "./identity";
import { filterCases, labels, parseFilters } from "./catalogue";
import { assert } from "./errors";

export async function recommendations(
  db: Sql,
  actor: string | null,
  params: URLSearchParams,
) {
  assert(
    [...params.keys()].every((key) => params.getAll(key).length === 1),
    400,
    "FILTER_INVALID",
    "Repeated filters are not supported.",
  );
  const limit = params.get("limit") ?? "10";
  assert(
    /^(?:[1-9]|10)$/.test(limit),
    400,
    "FILTER_INVALID",
    "Choose a limit from 1 to 10.",
  );
  const includeCompleted = params.get("includeCompleted") ?? "false";
  assert(
    ["true", "false"].includes(includeCompleted),
    400,
    "FILTER_INVALID",
    "Choose whether to include completed cases.",
  );
  const filters = new URLSearchParams(params);
  filters.delete("limit");
  filters.delete("includeCompleted");
  if (!filters.has("mode")) filters.set("mode", "solo");
  if (!filters.has("access")) filters.set("access", "free");
  const eligible = filterCases(
    (await catalogue(db)).filter((c) => c.access === "free"),
    parseFilters(filters),
  );
  const saved = actor ? await interests(db, actor) : { themes: [], version: 0 };
  // Case keys span versions and modes. A group reveal exposes the solution too.
  // Briefing-only rooms do not expose evidence and must not hide fresh cases.
  const exposed = actor
    ? (
        await db.query<{ case_key: string }>(
          `
    SELECT DISTINCT v.case_key FROM app_private.case_versions v
    JOIN app_private.attempts a ON a.case_version_id=v.id
    WHERE a.principal_id=$1
    UNION
    SELECT DISTINCT v.case_key FROM app_private.case_versions v
    JOIN app_private.rooms r ON r.case_version_id=v.id
    JOIN app_private.room_members m ON m.room_id=r.id
    WHERE m.principal_id=$1 AND (r.state->>'round')::integer>0
      AND r.state->>'phase' NOT IN ('lobby','briefing','cancelled')`,
          [actor],
        )
      ).rows.map((r) => r.case_key)
    : [];
  const ranked = eligible
    .map((c) => {
      const theme = saved.themes.find((t) =>
        c.discovery.themes.includes(t as (typeof c.discovery.themes)[number]),
      );
      return {
        ...c,
        rank: theme ? 3 : 0,
        replay: exposed.includes(c.id),
        reasonCode: theme ? "THEME_MATCH" : "AVAILABLE_CASE",
        recommendationReason: theme
          ? `Matches your interest in ${labels[theme] ?? theme}`
          : "A mystery to try",
      };
    })
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return {
    label: saved.themes.length ? "For you" : "Featured mysteries",
    algorithmVersion: "preview-theme-v2",
    preferenceVersion: saved.version,
    cases: ranked.filter((c) => !c.replay).slice(0, Number(limit)),
    replays:
      includeCompleted === "true"
        ? ranked.filter((c) => c.replay).slice(0, Number(limit))
        : [],
    completedCount: exposed.length,
  };
}
