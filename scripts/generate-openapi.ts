import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  requestCodeInput,
  verifyCodeInput,
  orderInput,
  emptyInput,
  accountSchema,
  orderSchema,
} from "../lib/contracts/account-commerce";
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "draft-2020-12", io: "input" });
const response = (s?: z.ZodType) => ({
  description: "Successful response in the data/meta envelope",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["data", "meta"],
        properties: { data: s ? schema(s) : {}, meta: { type: "object" } },
      },
    },
  },
});
const post = (input: z.ZodType, output?: z.ZodType, dev = false) => ({
  ...(dev ? { "x-development-only": true } : {}),
  security: [{ session: [] }],
  requestBody: {
    required: true,
    content: { "application/json": { schema: schema(input) } },
  },
  responses: {
    "200": response(output),
    "400": { description: "Invalid fields or expired code" },
    "401": { description: "Session required" },
    "403": { description: "Origin, owner or verified identity required" },
    "409": {
      description: "Merge confirmation, stale state or idempotency conflict",
    },
    "503": {
      description: "Provider not configured or development operation disabled",
    },
  },
});
const doc = {
  openapi: "3.1.0",
  info: {
    title: "PlotRush account and commerce foundation",
    version: "0.2.0",
    description:
      "Generated from runtime Zod contracts. Scope: newly implemented account/order routes; gameplay and admin paths remain to be added. Payment simulation is local development/test only. No live checkout or Paystack webhook contract is claimed.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "plotrush_guest" },
    },
  },
  paths: {
    "/account": { get: { responses: { "200": response(accountSchema) } } },
    "/auth/config": { get: { responses: { "200": response() } } },
    "/auth/request-code": { post: post(requestCodeInput) },
    "/auth/verify-code": { post: post(verifyCodeInput, accountSchema) },
    "/auth/sign-out": { post: post(emptyInput) },
    "/products": { get: { responses: { "200": response() } } },
    "/orders": {
      post: {
        ...post(orderInput, orderSchema, true),
        responses: {
          "201": response(orderSchema),
          "403": { description: "Verified email required" },
          "409": { description: "Idempotency conflict or already owned" },
          "503": { description: "Checkout disabled on deployment" },
        },
      },
    },
    "/orders/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        security: [{ session: [] }],
        responses: {
          "200": response(orderSchema),
          "404": { description: "Order not owned or unavailable" },
        },
      },
    },
    "/orders/{id}/development-payment": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: post(emptyInput, orderSchema, true),
    },
    "/me/ownership": {
      get: { security: [{ session: [] }], responses: { "200": response() } },
    },
  },
};
const content = JSON.stringify(doc, null, 2) + "\n",
  path = "docs/openapi-account-commerce.json";
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content)
    throw Error("Generated OpenAPI is stale. Run pnpm api:generate.");
  console.log("Account/commerce OpenAPI matches runtime contracts.");
} else {
  await writeFile(path, content);
  console.log("Generated " + path);
}
