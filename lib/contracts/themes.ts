import { z } from "zod";
import { themes } from "../domain/content";
export const themeEditInput = z
  .object({
    label: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(400),
    status: z.enum(["enabled", "retired"]),
    displayOrder: z.number().int().min(0).max(100),
    promoteOnHome: z.boolean(),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const themeSchema = z.object({
  id: z.uuid(),
  slug: z.enum(themes),
  label: z.string(),
  description: z.string(),
  status: z.enum(["enabled", "retired"]),
  displayOrder: z.number().int(),
  promoteOnHome: z.boolean(),
  revision: z.number().int().positive(),
});
export const themeAvailability = themeSchema.extend({
  count: z.number().int().nonnegative(),
  reviewedCount: z.number().int().nonnegative(),
  ready: z.boolean(),
  promoted: z.boolean(),
});
export type Theme = z.infer<typeof themeSchema>;
