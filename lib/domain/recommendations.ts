import type { Sql } from "../db/types";
import { catalogue } from "./game";
import { interests } from "./identity";
import {
  filterCases,
  labels,
  parseFilters,
  comparePublication,
} from "./catalogue";
import { assert } from "./errors";
import { emptyInterests, type Interests } from "../contracts/interests";
import type { CaseCard } from "./content";

export function preferenceScore(c: CaseCard, saved: Interests) {
  if (!saved.personalisationEnabled)
    return {
      rank: 0,
      reasonCode: "AVAILABLE_CASE",
      recommendationReason: "A mystery to try",
    };
  const theme = saved.themes.find((t) => c.discovery.themes.includes(t));
  const mood = saved.moods.find((m) => c.discovery.moods.includes(m));
  const difficulty = saved.preferredDifficulty === c.discovery.difficulty;
  const reasons = [
    theme ? `your interest in ${labels[theme]}` : null,
    mood ? `your ${labels[mood].toLowerCase()} mood preference` : null,
    difficulty
      ? `your ${labels[c.discovery.difficulty].toLowerCase()} difficulty preference`
      : null,
  ].filter(Boolean);
  return {
    rank: (theme ? 3 : 0) + (mood ? 2 : 0) + (difficulty ? 1 : 0),
    reasonCode: theme
      ? "THEME_MATCH"
      : mood
        ? "MOOD_MATCH"
        : difficulty
          ? "DIFFICULTY_MATCH"
          : "AVAILABLE_CASE",
    recommendationReason: reasons.length
      ? `Matches ${reasons.join(" and ")}`
      : "A mystery to try",
  };
}

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
  const saved = actor ? await interests(db, actor) : emptyInterests();
  const personalised = !!(
    saved.personalisationEnabled &&
    (saved.themes.length || saved.moods.length || saved.preferredDifficulty)
  );
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
      return {
        ...c,
        ...preferenceScore(c, saved),
        replay: exposed.includes(c.id),
      };
    })
    .sort((a, b) =>
      personalised
        ? b.rank - a.rank || comparePublication(a, b)
        : (a.featuredRank ?? Infinity) - (b.featuredRank ?? Infinity) ||
          comparePublication(a, b),
    );
  return {
    label: personalised ? "For you" : "Featured mysteries",
    algorithmVersion: "editorial-preferences-v4",
    preferenceVersion: saved.version,
    cases: ranked.filter((c) => !c.replay).slice(0, Number(limit)),
    replays:
      includeCompleted === "true"
        ? ranked.filter((c) => c.replay).slice(0, Number(limit))
        : [],
    exposedCount: exposed.length,
  };
}
