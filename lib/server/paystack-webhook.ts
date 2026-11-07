import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  paystackConfig,
  validWebhook,
  parseWebhook,
} from "../providers/paystack";
import { receiveWebhook } from "../domain/payment-operations";
import { database } from "./database";
import { AppError, assert } from "../domain/errors";
export async function paystackWebhook(req: NextRequest) {
  try {
    const config = paystackConfig();
    assert(
      config,
      503,
      "PAYMENT_CONFIG_REQUIRED",
      "Payment verification is not configured.",
    );
    const reader = req.body?.getReader();
    assert(reader, 400, "BODY_REQUIRED", "Body required.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new AppError(413, "BODY_TOO_LARGE", "Event too large.");
      }
      chunks.push(part.value);
    }
    const raw = Buffer.concat(chunks);
    assert(
      validWebhook(raw, req.headers, config),
      401,
      "SIGNATURE_INVALID",
      "Invalid payment event signature.",
    );
    const event = parseWebhook(raw);
    const result = await receiveWebhook(
      await database(),
      event,
      config.environment,
      raw,
    );
    // Durable acknowledgement only. Worker and owner verification do the network
    // call; no detached promise or unbounded provider wait in the webhook route.
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: {
          code:
            e instanceof AppError
              ? e.code
              : e instanceof z.ZodError
                ? "INVALID_EVENT"
                : "UNAVAILABLE",
        },
      },
      {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
