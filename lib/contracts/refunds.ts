import { z } from "zod";
import { disputeSummary } from "./disputes";

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
  disputes: z.array(disputeSummary),
});
export type FinanceOrder = z.infer<typeof financeOrderSchema>;

const reportDate = z.iso.date().refine((date) => !date.startsWith("0000"));
export const financeRevenueQuery = z
  .object({ from: reportDate, to: reportDate })
  .refine(({ from, to }) => {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    return days >= 0 && days < 31;
  });
