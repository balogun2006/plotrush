import { z } from "zod";

const minorUnits = z.number().int().nonnegative();
export const refundReason = z.string().trim().min(1).max(500);
export const refundRequestInput = z.object({ reason: refundReason }).strict();
export const closeRefundInput = refundRequestInput.extend({
  requestId: z.uuid(),
});
export const reconcileRefundInput = z
  .object({
    providerId: z.string().regex(/^[1-9][0-9]{0,19}$/),
  })
  .strict();

export const refundSummary = z.object({
  refundedMinor: minorUnits,
  refundRequested: z.boolean(),
});

export const financeOrderSchema = refundSummary.extend({
  id: z.uuid(),
  reference: z.string(),
  productId: z.string(),
  amountMinor: minorUnits,
  currency: z.string(),
  reason: z.string().nullable(),
  requestId: z.uuid().nullable(),
});
export type FinanceOrder = z.infer<typeof financeOrderSchema>;
