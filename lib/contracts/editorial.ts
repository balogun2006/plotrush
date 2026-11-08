import { z } from "zod";
import { caseSchema } from "../domain/content";
export const editorialCase = caseSchema.superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const strings = (v: unknown): void => {
    if (typeof v === "string" && (!v.trim() || v.length > 10000))
      fail("Text must be nonempty and at most 10000 characters");
    else if (Array.isArray(v)) v.forEach(strings);
    else if (v && typeof v === "object") Object.values(v).forEach(strings);
  };
  strings(c);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.key) ||
    c.key.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug) ||
    c.slug.length > 80
  )
    fail("Use short lowercase hyphenated case keys and slugs");
  if (c.minPlayers > c.maxPlayers || c.maxPlayers > 6)
    fail("Supported player bounds are 1–6");
  if (
    c.modes.includes("group") &&
    (c.minPlayers < 2 || c.rounds.some((r) => r.clues.length < c.maxPlayers))
  )
    fail("Group rounds need at least one clue per supported seat");
  if (!c.answer.decisiveClueIds.length) fail("Decisive evidence is required");
  if (
    c.suspects.some(
      (s) => s.id !== c.answer.suspectId && !c.answer.eliminations[s.id],
    )
  )
    fail("Explain why every alternative suspect is ruled out");
  const hints = c.rounds.flatMap((r) => r.hints.map((h) => h.id));
  if (new Set(hints).size !== hints.length)
    fail("Hint identifiers must be unique");
  for (const r of c.rounds)
    if (
      r.hints.length !== 2 ||
      !r.hints.some((h) => h.tier === 1) ||
      !r.hints.some((h) => h.tier === 2)
    )
      fail("Each round requires exactly one tier 1 and tier 2 hint");
});
export const draftInput = z.object({ content: editorialCase }).strict();
export const saveDraftInput = draftInput
  .extend({ expectedRevision: z.number().int().positive() })
  .strict();
export const revisionInput = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const reviewInput = revisionInput
  .extend({
    review: z
      .object({
        logic: z.literal(true),
        accessibility: z.literal(true),
        rights: z.literal(true),
        sensitivity: z.literal(true),
        spoilers: z.literal(true),
        blindTest: z.string().trim().min(10).max(2000),
        notes: z.string().trim().min(10).max(4000),
      })
      .strict(),
  })
  .strict();
export const codeInput = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const scheduleInput = z
  .object({ day: z.iso.date(), versionId: z.string().min(1).max(160) })
  .strict();
export const unpublishInput = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();
