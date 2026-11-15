import { z } from "zod";
export const privacyRequestSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["export", "deletion"]),
  state: z.enum(["ready", "pending", "deferred", "cancelled", "completed"]),
  revision: z.number().int().positive(),
  requestedAt: z.string(),
  updatedAt: z.string(),
});
export const deletionRequestInput = z
  .object({ confirmation: z.literal("DELETE MY ACCOUNT") })
  .strict();
export const privacyRevisionInput = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const privacyReviewInput = privacyRevisionInput
  .extend({
    decision: z.enum(["defer", "complete"]),
    reason: z.string().trim().min(10).max(1000),
    retentionReference: z.string().trim().min(10).max(300),
    backupReference: z.string().trim().min(10).max(300),
    retentionReviewed: z.literal(true),
  })
  .strict();
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;
