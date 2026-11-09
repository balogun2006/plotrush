import { z } from "zod";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const requestCodeInput = z.object({ email: emailSchema }).strict();
export const verifyCodeInput = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{8}$/),
    confirmMerge: z.boolean().default(false),
  })
  .strict();
export const orderInput = z
  .object({
    productId: z.string().max(80),
    priceVersionId: z.string().max(100),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const emptyInput = z.object({}).strict();
export const accountSchema = z.union([
  z.object({ kind: z.literal("guest") }),
  z.object({
    kind: z.literal("verified"),
    email: z.email(),
    verifiedAt: z.string(),
  }),
]);
export const orderSchema = z.object({
  id: z.uuid(),
  productId: z.string(),
  caseId: z.string(),
  playAvailable: z.boolean().optional(),
  mode: z.enum(["solo", "group"]),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum(["pending", "paid", "expired"]),
  environment: z.enum(["development", "test", "live"]),
  expiresAt: z.string(),
  paidAt: z.string().nullable(),
});

export const premiumLibrarySchema = z.array(
  z.object({
    caseId: z.string(),
    mode: z.enum(["solo", "group"]),
    title: z.string(),
  }),
);
