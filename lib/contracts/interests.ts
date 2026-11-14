import { z } from "zod";
import { taxonomySlug, difficulties } from "../domain/content";
const unique = (xs: string[]) => new Set(xs).size === xs.length;
export const interestInput = z
  .object({
    themes: z.array(taxonomySlug).max(100).refine(unique),
    moods: z.array(taxonomySlug).max(100).refine(unique).optional(),
    preferredDifficulty: z.enum(difficulties).nullable().optional(),
    personalisationEnabled: z.boolean().optional(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const interestDeleteInput = z
  .object({ expectedVersion: z.number().int().nonnegative() })
  .strict();
export const interestsSchema = z.object({
  themes: interestInput.shape.themes,
  moods: z.array(taxonomySlug),
  preferredDifficulty: z.enum(difficulties).nullable(),
  personalisationEnabled: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type Interests = z.infer<typeof interestsSchema>;
export const emptyInterests = (): Interests => ({
  themes: [],
  moods: [],
  preferredDifficulty: null,
  personalisationEnabled: true,
  version: 0,
});
export type InterestOptions = Pick<
  z.infer<typeof interestInput>,
  "moods" | "preferredDifficulty" | "personalisationEnabled"
>;

export const uuidInterestInput = z
  .object({
    themeIds: z.array(z.uuid()).max(100).refine(unique),
    moodIds: z.array(z.uuid()).max(100).refine(unique),
    preferredDifficulty: z.enum(difficulties).nullable(),
    personalisationEnabled: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const uuidInterestsSchema = interestsSchema
  .omit({ themes: true, moods: true, version: true })
  .extend({
    themeIds: z.array(z.uuid()),
    moodIds: z.array(z.uuid()),
    preferenceVersion: z.number().int().nonnegative(),
  });

export type UuidInterests = z.infer<typeof uuidInterestsSchema>;
