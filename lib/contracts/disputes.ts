import { z } from "zod";

export const disputeId = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const reconcileDisputeInput = z
  .object({ providerId: disputeId })
  .strict();
export const disputeSummary = z.object({
  providerId: disputeId,
  status: z.string(),
  resolution: z.string().nullable(),
  refundMinor: z.number().int().nonnegative().nullable(),
  holdsAccess: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type DisputeSummary = z.infer<typeof disputeSummary>;
