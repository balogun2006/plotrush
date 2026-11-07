import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
test("webhook checks raw signatures and size before durably acknowledging an ignored event", async ({
  request,
  page,
}) => {
  const raw = JSON.stringify({ event: "integration.ignored", data: { id: 1 } });
  const invalid = await request.post("/api/webhooks/paystack", {
    data: raw,
    headers: { "Content-Type": "application/json" },
  });
  expect(invalid.status()).toBe(401);
  const seconds = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha512", "whsec_" + "b".repeat(32))
    .update(seconds + ".")
    .update(raw)
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "Paystack-Signature": `t=${seconds},v1=whk_test:${digest}`,
  };
  for (let i = 0; i < 2; i++) {
    const accepted = await request.post("/api/webhooks/paystack", {
      data: raw,
      headers,
    });
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toEqual({ received: true });
  }
  const tampered = await request.post("/api/webhooks/paystack", {
    data: raw + " ",
    headers,
  });
  expect(tampered.status()).toBe(401);
  const oversized = await request.post("/api/webhooks/paystack", {
    data: "x".repeat(262145),
    headers,
  });
  expect(oversized.status()).toBe(413);
  const guest = await page.request.put("/api/v1/interests", {
    data: { themes: [], expectedVersion: 0 },
    headers: {
      Origin: "http://127.0.0.1:3000",
      "x-forwarded-for": "198.51.100.222",
    },
  });
  expect(guest.ok()).toBe(true);
  await page.goto(
    "/orders/00000000-0000-4000-8000-000000000001?status=success&reference=fake",
  );
  await expect(
    page.getByText("Order unavailable.", { exact: true }),
  ).toBeVisible();
});
