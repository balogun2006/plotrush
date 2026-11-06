import { z } from "zod";
export const themes = [
  "thriller",
  "cold-case",
  "wedding-family",
  "heist",
  "supernatural",
  "everyday-mystery",
] as const;
export const moods = ["lighthearted", "suspenseful", "dark"] as const;
export const difficulties = ["beginner", "intermediate", "expert"] as const;
const clue = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  round: z.number().int().positive(),
});
const choice = z.object({ id: z.string(), name: z.string() });
export const caseSchema = z
  .object({
    key: z.string(),
    slug: z.string(),
    title: z.string(),
    synopsis: z.string(),
    briefing: z.string(),
    kind: z.enum(["mini", "tutorial", "premium"]),
    access: z.enum(["free", "paid"]),
    modes: z.array(z.enum(["solo", "group"])).min(1),
    minPlayers: z.number().int().positive(),
    maxPlayers: z.number().int().positive(),
    suspects: z.array(choice).min(2),
    reasons: z.array(z.object({ id: z.string(), text: z.string() })).min(2),
    rounds: z
      .array(
        z.object({
          number: z.number().int().positive(),
          title: z.string(),
          clues: z.array(clue).min(1),
          hints: z.array(
            z.object({ id: z.string(), tier: z.number(), text: z.string() }),
          ),
        }),
      )
      .min(1),
    answer: z.object({
      suspectId: z.string(),
      reasonId: z.string(),
      decisiveClueIds: z.array(z.string()),
      explanation: z.string(),
      eliminations: z.record(z.string(), z.string()),
    }),
    discovery: z.object({
      primaryTheme: z.enum(themes),
      themes: z.array(z.enum(themes)).min(1).max(3),
      moods: z.array(z.enum(moods)).min(1).max(2),
      difficulty: z.enum(difficulties),
      contentWarnings: z.array(z.string()),
      estimatedDurationMinutes: z.object({
        solo: z.number().int().positive().optional(),
        group: z.number().int().positive().optional(),
      }),
    }),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!c.discovery.themes.includes(c.discovery.primaryTheme))
      fail("Primary theme must be a tag");
    for (const values of [
      c.discovery.themes,
      c.discovery.moods,
      c.modes,
      c.suspects.map((x) => x.id),
      c.reasons.map((x) => x.id),
      c.rounds.flatMap((r) => r.clues.map((x) => x.id)),
    ])
      if (new Set(values).size !== values.length) fail("Duplicate identifiers");
    for (const mode of c.modes)
      if (!c.discovery.estimatedDurationMinutes[mode])
        fail("Missing mode duration");
    if (
      !c.suspects.some((s) => s.id === c.answer.suspectId) ||
      !c.reasons.some((r) => r.id === c.answer.reasonId)
    )
      fail("Unknown answer");
    if (
      c.answer.decisiveClueIds.some(
        (id) => !c.rounds.flatMap((r) => r.clues).some((x) => x.id === id),
      )
    )
      fail("Unknown decisive clue");
    c.rounds.forEach((r, i) => {
      if (r.number !== i + 1 || r.clues.some((x) => x.round !== r.number))
        fail("Invalid round sequence");
    });
  });
export type Case = z.infer<typeof caseSchema>;
export function card(c: Case) {
  return {
    id: c.key,
    slug: c.slug,
    title: c.title,
    synopsis: c.synopsis,
    access: c.access,
    modes: c.modes,
    kind: c.kind,
    discovery: c.discovery,
    minPlayers: c.minPlayers,
    maxPlayers: c.maxPlayers,
  };
}
export type CaseCard = ReturnType<typeof card>;
