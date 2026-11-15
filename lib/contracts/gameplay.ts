import { z } from "zod";
export const gameRevisionInput = z
  .object({ expectedVersion: z.number().int().nonnegative() })
  .strict();
export const notesWriteInput = z
  .object({
    text: z.string().max(2000),
    expectedNotesVersion: z.number().int().nonnegative(),
  })
  .strict();
export const soloNotesInput = z.union([
  notesWriteInput,
  z
    .object({
      text: z.string().max(2000),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const notesOutput = z.object({
  notes: z.string(),
  notesVersion: z.number().int().nonnegative(),
  readOnly: z.boolean(),
  archivedNotes: z
    .array(z.object({ id: z.string().uuid(), notes: z.string() }))
    .optional(),
});
