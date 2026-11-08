import {
  draftInput,
  saveDraftInput,
  revisionInput,
  reviewInput,
  codeInput,
  scheduleInput,
  unpublishInput,
} from "../lib/contracts/editorial";
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
const staffSecurity = [{ session: [], staffSession: [] }];
const staffPost = (input: z.ZodType, role: string) => ({
  ...post(input),
  security: staffSecurity,
  "x-staff-role": role,
  responses: {
    "200": response(),
    "400": { description: "Invalid document or review" },
    "403": { description: "Staff role/fresh MFA required" },
    "409": { description: "Stale revision or invalid transition" },
    "503": { description: "Publishing disabled or unavailable" },
  },
});
const draftId = [
  {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
];
const staffPaths = {
  "/admin/access": {
    get: {
      security: [{ session: [] }],
      responses: {
        "200": response(),
        "403": { description: "Not a staff member" },
      },
    },
  },
  "/admin/mfa/enroll": {
    post: {
      ...staffPost(
        emptyInput,
        "staff membership + fresh email session; no prior MFA",
      ),
      security: [{ session: [] }],
    },
  },
  "/admin/mfa/verify": {
    post: {
      ...staffPost(
        codeInput,
        "staff membership + valid TOTP; creates staff cookie",
      ),
      security: [{ session: [] }],
    },
  },
  "/admin/mfa/lock": {
    post: {
      ...staffPost(emptyInput, "staff membership"),
      security: [{ session: [] }],
    },
  },
  "/admin/cases": {
    get: { security: staffSecurity, responses: { "200": response() } },
    post: staffPost(draftInput, "content_editor"),
  },
  "/admin/cases/{id}": {
    parameters: draftId,
    get: { security: staffSecurity, responses: { "200": response() } },
    put: staffPost(saveDraftInput, "content_editor"),
  },
  ...Object.fromEntries(
    ["submit", "return", "approve", "publish", "revise"].map((action) => [
      "/admin/cases/{id}/" + action,
      {
        parameters: draftId,
        post: staffPost(
          action === "approve" ? reviewInput : revisionInput,
          ["approve", "publish", "return"].includes(action)
            ? "content_publisher"
            : "content_editor",
        ),
      },
    ]),
  ),
  "/admin/templates": {
    get: { security: staffSecurity, responses: { "200": response() } },
  },
  "/admin/audit": {
    get: { security: staffSecurity, responses: { "200": response() } },
  },
  "/admin/calendar": {
    post: staffPost(scheduleInput, "content_publisher + publication switch"),
  },
  "/admin/releases/{key}/unpublish": {
    parameters: [
      { name: "key", in: "path", required: true, schema: { type: "string" } },
    ],
    post: staffPost(unpublishInput, "content_publisher"),
  },
};
const doc = {
  openapi: "3.1.0",
  info: {
    title: "PlotRush account and commerce foundation",
    version: "0.2.0",
    description:
      "Generated from runtime Zod contracts. Scope: newly implemented account/order routes; gameplay paths remain to be added. Staff editorial routes require protected roles and a fresh MFA cookie. Payment simulation is local-only. Paystack test checkout, verification and signed webhook acknowledgement are implemented; live billing remains gated.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "plotrush_guest" },
      staffSession: { type: "apiKey", in: "cookie", name: "plotrush_staff" },
    },
  },
  paths: {
    ...staffPaths,
    "/api/webhooks/paystack": {
      servers: [{ url: "/" }],
      post: {
        description:
          "Raw-body signed Paystack event. No cookie/Origin required. Timestamped Paystack-Signature preferred; optional explicit legacy x-paystack-signature. Acknowledged after durable inbox insert.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Durably received" },
          "401": { description: "Invalid signature" },
          "413": { description: "Event too large" },
          "503": { description: "Configuration or database unavailable" },
        },
      },
    },
    "/account": { get: { responses: { "200": response(accountSchema) } } },
    "/auth/config": { get: { responses: { "200": response() } } },
    "/auth/request-code": { post: post(requestCodeInput) },
    "/auth/verify-code": { post: post(verifyCodeInput, accountSchema) },
    "/auth/sign-out": { post: post(emptyInput) },
    "/products": { get: { responses: { "200": response() } } },
    "/orders": {
      post: {
        ...post(orderInput, orderSchema),
        responses: {
          "201": response(orderSchema),
          "403": { description: "Verified email required" },
          "409": { description: "Idempotency conflict or already owned" },
          "503": { description: "Checkout disabled or provider unconfigured" },
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
    "/orders/{id}/checkout": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: post(emptyInput),
    },
    "/orders/{id}/verify": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: post(emptyInput, orderSchema),
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
