import { z } from "zod";
import { themes, moods, difficulties } from "../domain/content";
const unique = (xs: string[]) => new Set(xs).size === xs.length;
export const interestInput = z
  .object({
    themes: z.array(z.enum(themes)).max(themes.length).refine(unique),
    moods: z.array(z.enum(moods)).max(moods.length).refine(unique).optional(),
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
  moods: z.array(z.enum(moods)),
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
