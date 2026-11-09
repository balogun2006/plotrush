import type { VerifiedPayment } from "../domain/commerce";
import { localAdaptersAllowed } from "./email";
import { assert } from "../domain/errors";
// Deterministic development adapter; no provider calls, money or real receipt.
// There is intentionally no public callback that can invent a Paystack success.
export function developmentPayment(
  reference: string,
  amountMinor: number,
  currency: string,
): VerifiedPayment {
  assert(
    localAdaptersAllowed(),
    503,
    "MOCK_DISABLED",
    "Development payments are unavailable here.",
  );
  return {
    reference,
    transactionId: "demo_" + reference,
    amountMinor,
    currency,
    environment: "development",
    success: true,
  };
}
