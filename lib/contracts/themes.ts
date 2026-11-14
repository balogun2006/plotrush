import { z } from "zod";
import { taxonomySlug } from "../domain/content";
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
  slug: taxonomySlug,
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

export const themeCreateInput = themeEditInput
  .omit({ expectedRevision: true, promoteOnHome: true })
  .extend({ slug: taxonomySlug });
export const themeRenameInput = z
  .object({
    slug: taxonomySlug,
    expectedRevision: z.number().int().positive(),
    reason: themeEditInput.shape.reason,
  })
  .strict();
export const moodSchema = z.object({
  id: z.uuid(),
  slug: taxonomySlug,
  label: z.string(),
  status: z.enum(["enabled", "retired"]),
  revision: z.number().int().positive(),
});
export const moodEditInput = z
  .object({
    label: themeEditInput.shape.label,
    status: themeEditInput.shape.status,
    expectedRevision: themeEditInput.shape.expectedRevision,
    reason: themeEditInput.shape.reason,
  })
  .strict();
export const moodCreateInput = moodEditInput
  .omit({ expectedRevision: true })
  .extend({ slug: taxonomySlug });
export type Mood = z.infer<typeof moodSchema>;
