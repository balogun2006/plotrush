import { z } from "zod";
import { AppError } from "./errors";
import { CaseCard, themes, moods, difficulties } from "./content";
export const labels: Record<string, string> = {
  thriller: "Thriller",
  "cold-case": "Cold Case",
  "wedding-family": "Wedding & Family",
  heist: "Heist",
  supernatural: "Supernatural",
  "everyday-mystery": "Everyday Mystery",
  lighthearted: "Lighthearted",
  suspenseful: "Suspenseful",
  dark: "Dark",
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
};
const list = (values: readonly string[]) =>
  z
    .string()
    .default("")
    .transform((s) =>
      [
        ...new Set(
          s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ].sort(),
    )
    .refine((xs) => xs.every((x) => values.includes(x)), "Unknown filter");
const schema = z
  .object({
    mode: z.enum(["any", "solo", "group"]).default("any"),
    themes: list(themes),
    moods: list(moods),
    difficulty: list(difficulties),
    duration: z
      .enum(["any", "lt10", "10to19", "20to30", "gt30"])
      .default("any"),
    access: z.enum(["any", "free", "paid"]).default("any"),
    sort: z
      .enum(["newest", "duration_asc", "difficulty_asc"])
      .default("newest"),
  })
  .strict();
export type Filters = z.infer<typeof schema>;
export function parseFilters(params: URLSearchParams): Filters {
  if (
    params.toString().length > 2048 ||
    [...params.keys()].some((k) => params.getAll(k).length > 1)
  )
    throw new AppError(400, "FILTER_INVALID", "Invalid or repeated filters.");
  const r = schema.safeParse(Object.fromEntries(params));
  if (!r.success)
    throw new AppError(
      400,
      "FILTER_INVALID",
      "Choose a valid theme, mood, difficulty, duration or mode.",
    );
  return r.data;
}
export function inBucket(n: number, bucket: string) {
  return (
    bucket === "any" ||
    (bucket === "lt10" && n < 10) ||
    (bucket === "10to19" && n >= 10 && n <= 19) ||
    (bucket === "20to30" && n >= 20 && n <= 30) ||
    (bucket === "gt30" && n > 30)
  );
}
export function duration(c: CaseCard, f: Filters) {
  return Math.min(
    ...c.modes
      .filter(
        (m) =>
          (f.mode === "any" || m === f.mode) &&
          inBucket(c.discovery.estimatedDurationMinutes[m]!, f.duration),
      )
      .map((m) => c.discovery.estimatedDurationMinutes[m]!),
  );
}
export function filterCases(cases: CaseCard[], f: Filters) {
  return cases
    .filter(
      (c) =>
        (f.mode === "any" || c.modes.includes(f.mode)) &&
        (!f.themes.length ||
          f.themes.some((t) =>
            c.discovery.themes.includes(t as (typeof themes)[number]),
          )) &&
        (!f.moods.length ||
          f.moods.some((t) =>
            c.discovery.moods.includes(t as (typeof moods)[number]),
          )) &&
        (!f.difficulty.length ||
          f.difficulty.includes(c.discovery.difficulty)) &&
        (f.access === "any" || c.access === f.access) &&
        Number.isFinite(duration(c, f)),
    )
    .sort((a, b) => {
      const delta =
        f.sort === "duration_asc"
          ? duration(a, f) - duration(b, f)
          : f.sort === "difficulty_asc"
            ? difficulties.indexOf(a.discovery.difficulty) -
              difficulties.indexOf(b.discovery.difficulty)
            : 0;
      // Drafts have no publication timestamps. Stable IDs order the preview; production uses first_published_at.
      return delta || a.id.localeCompare(b.id);
    });
}
export function facets(cases: CaseCard[], f: Filters) {
  return Object.fromEntries(
    ["themes", "moods", "difficulty"].map((key) => [
      key,
      Object.fromEntries(
        (key === "themes"
          ? themes
          : key === "moods"
            ? moods
            : difficulties
        ).map((id) => [id, filterCases(cases, { ...f, [key]: [id] }).length]),
      ),
    ]),
  );
}
