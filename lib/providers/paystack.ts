import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, assert } from "../domain/errors";
import type { VerifiedPayment } from "../domain/commerce";
export type PaystackConfig = {
  secret: string;
  environment: "test" | "live";
  appUrl: string;
  webhookSecret?: string;
  previousWebhookSecret?: string;
  allowLegacy: boolean;
};
export function paystackConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): PaystackConfig | null {
  const environment = env.PAYSTACK_ENVIRONMENT ?? "test",
    secret = env.PAYSTACK_SECRET_KEY ?? "";
  if (
    !["test", "live"].includes(environment) ||
    !new RegExp("^sk_" + environment + "_[A-Za-z0-9]{16,}$").test(secret)
  )
    return null;
  try {
    const url = new URL(env.APP_URL ?? "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return {
      secret,
      environment: environment as "test" | "live",
      appUrl: url.origin,
      webhookSecret: env.PAYSTACK_WEBHOOK_SECRET,
      previousWebhookSecret: env.PAYSTACK_WEBHOOK_SECRET_PREVIOUS,
      allowLegacy: env.PAYSTACK_ALLOW_LEGACY_WEBHOOKS === "true",
    };
  } catch {
    return null;
  }
}
export function checkoutConfig(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const config = paystackConfig(env),
    signing =
      !!config &&
      (!!config.webhookSecret?.startsWith("whsec_") || config.allowLegacy);
  // This application still serves draft content. Live billing requires a later
  // production release; sandbox checkout is independently configurable now.
  return {
    available:
      env.FEATURE_PAYMENTS === "true" &&
      env.PAYMENT_PROVIDER === "paystack" &&
      config?.environment === "test" &&
      signing,
    environment: config?.environment ?? null,
    sandboxCatalogue:
      env.FEATURE_SANDBOX_CATALOGUE === "true" &&
      config?.environment === "test",
    liveBillingAvailable: false,
  };
}
const id = z
  .union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform(String);
const verified = z.object({
  status: z.literal(true),
  data: z.object({
    id,
    domain: z.enum(["test", "live"]),
    status: z.string(),
    reference: z.string().max(100),
    amount: z.number().int().nonnegative().max(100000000),
    currency: z.string().length(3),
    customer: z.object({ email: z.email() }),
  }),
});
async function boundedResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError(
      503,
      "PROVIDER_UNAVAILABLE",
      "Payment provider response unavailable.",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 262144) {
      await reader.cancel();
      throw new AppError(
        503,
        "PROVIDER_UNAVAILABLE",
        "Payment provider response too large.",
      );
    }
    chunks.push(part.value);
  }
  try {
    // Preserve documented unsigned 64-bit provider IDs without rounding them.
    return JSON.parse(
      Buffer.concat(chunks)
        .toString("utf8")
        .replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'),
    );
  } catch {
    throw new AppError(
      503,
      "PROVIDER_UNAVAILABLE",
      "Payment provider response invalid.",
    );
  }
}
export class PaystackClient {
  constructor(
    readonly config: PaystackConfig,
    private transport: typeof fetch = fetch,
  ) {}
  private async call(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.transport("https://api.paystack.co" + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: "Bearer " + this.config.secret,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AppError(
        503,
        "PROVIDER_UNAVAILABLE",
        "Paystack is temporarily unavailable. Check payment status before retrying.",
      );
    }
    if (!response.ok)
      throw new AppError(
        response.status >= 500 || response.status === 429 ? 503 : 409,
        "PROVIDER_REJECTED",
        "Paystack could not complete this request. Check payment status before retrying.",
      );
    return boundedResponse(response);
  }
  async initialize(input: {
    reference: string;
    email: string;
    amountMinor: number;
    currency: string;
    orderId: string;
  }) {
    assert(
      /^[A-Za-z0-9.=-]{1,100}$/.test(input.reference),
      400,
      "REFERENCE_INVALID",
      "Invalid payment reference.",
    );
    const callback = new URL(
      "/orders/" + input.orderId,
      this.config.appUrl,
    ).toString();
    const result = z
      .object({
        status: z.literal(true),
        data: z.object({
          reference: z.literal(input.reference),
          authorization_url: z.url(),
        }),
      })
      .safeParse(
        await this.call("/transaction/initialize", {
          email: input.email,
          amount: String(input.amountMinor),
          currency: input.currency,
          reference: input.reference,
          callback_url: callback,
        }),
      );
    assert(
      result.success,
      503,
      "PROVIDER_UNAVAILABLE",
      "Paystack response was invalid.",
    );
    const url = new URL(result.data.data.authorization_url);
    assert(
      url.protocol === "https:" &&
        url.hostname === "checkout.paystack.com" &&
        !url.username &&
        !url.password,
      503,
      "CHECKOUT_URL_INVALID",
      "Paystack returned an unexpected checkout address.",
    );
    return url.toString();
  }
  async verify(reference: string, email: string): Promise<VerifiedPayment> {
    assert(
      /^[A-Za-z0-9.=_-]{1,100}$/.test(reference),
      400,
      "REFERENCE_INVALID",
      "Invalid payment reference.",
    );
    const result = verified.safeParse(
      await this.call("/transaction/verify/" + encodeURIComponent(reference)),
    );
    assert(
      result.success,
      503,
      "PROVIDER_UNAVAILABLE",
      "Paystack verification response was invalid.",
    );
    const d = result.data.data;
    assert(
      d.reference === reference &&
        d.domain === this.config.environment &&
        d.customer.email.toLowerCase() === email.toLowerCase(),
      409,
      "PAYMENT_MISMATCH",
      "Provider verification does not match this purchase.",
    );
    return {
      reference: d.reference,
      transactionId: d.id,
      amountMinor: d.amount,
      currency: d.currency,
      environment: d.domain,
      success: d.status === "success",
    };
  }
}
const matches = (actual: string, expected: string) =>
  /^[a-f0-9]{128}$/.test(actual) &&
  timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
export function validWebhook(
  raw: Buffer,
  headers: Headers,
  config: PaystackConfig,
  now = Date.now(),
) {
  const modern = headers.get("paystack-signature");
  if (modern) {
    const parts = modern.split(",").map((x) => x.trim()),
      times = parts.filter((x) => x.startsWith("t="));
    if (times.length !== 1 || !/^t=\d{1,12}$/.test(times[0])) return false;
    const t = times[0].slice(2);
    if (Math.abs(now / 1000 - Number(t)) > 300) return false;
    const signatures = parts
      .filter((x) => x.startsWith("v1="))
      .map((x) => x.slice(3))
      .filter((x) => /^whk_[A-Za-z0-9_-]+:[a-f0-9]{128}$/.test(x))
      .map((x) => x.slice(x.indexOf(":") + 1));
    return [config.webhookSecret, config.previousWebhookSecret]
      .filter((x): x is string => !!x && x.startsWith("whsec_"))
      .some((secret) => {
        const expected = createHmac("sha512", secret)
          .update(t + ".")
          .update(raw)
          .digest("hex");
        return signatures.some((signature) => matches(signature, expected));
      });
  }
  return (
    config.allowLegacy &&
    matches(
      headers.get("x-paystack-signature") ?? "",
      createHmac("sha512", config.secret).update(raw).digest("hex"),
    )
  );
}
export function parseWebhook(raw: Buffer) {
  let input: unknown;
  try {
    input = JSON.parse(
      raw
        .toString("utf8")
        .replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'),
    );
  } catch {
    throw new AppError(400, "INVALID_EVENT", "Invalid payment event.");
  }
  const envelope = z
    .object({ event: z.string().min(1).max(100), data: z.unknown() })
    .parse(input);
  if (envelope.event !== "charge.success")
    return { eventType: envelope.event, reference: null, transactionId: null };
  const d = z
    .object({ id, reference: z.string().regex(/^[A-Za-z0-9.=_-]{1,100}$/) })
    .parse(envelope.data);
  return {
    eventType: envelope.event,
    reference: d.reference,
    transactionId: d.id,
  };
}
