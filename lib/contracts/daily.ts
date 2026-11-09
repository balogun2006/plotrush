import { z } from "zod";

export const dailyStartInput = z
  .object({
    day: z.iso.date(),
    versionId: z.string().min(1).max(180),
  })
  .strict();

const dailyCase = z.object({
  caseId: z.string(),
  title: z.string(),
});

export const dailySchema = z.object({
  day: z.iso.date(),
  serverTime: z.iso.datetime(),
  resetsAt: z.iso.datetime(),
  streak: z.number().int().nonnegative(),
  release: dailyCase
    .extend({
      versionId: z.string(),
      attemptId: z.uuid().nullable(),
      completed: z.boolean(),
    })
    .nullable(),
  resume: dailyCase
    .extend({ day: z.iso.date(), attemptId: z.uuid() })
    .nullable(),
  archive: dailyCase.nullable(),
});

export type Daily = z.infer<typeof dailySchema>;
