import {
  disputeSummary,
  reconcileDisputeInput,
} from "../lib/contracts/disputes";
import {
  financeOrderSchema,
  financeRevenueQuery,
  reconcileRefundInput,
  refundRequestInput,
  closeRefundInput,
} from "../lib/contracts/refunds";
import {
  draftInput,
  saveDraftInput,
  revisionInput,
  reviewInput,
  codeInput,
  scheduleInput,
  unpublishInput,
  featuredInput,
} from "../lib/contracts/editorial";
import { dailySchema, dailyStartInput } from "../lib/contracts/daily";
import {
  interestInput,
  interestDeleteInput,
  interestsSchema,
  uuidInterestInput,
  uuidInterestsSchema,
} from "../lib/contracts/interests";
import {
  deletionRequestInput,
  privacyRevisionInput,
  privacyReviewInput,
  privacyRequestSchema,
} from "../lib/contracts/privacy";
import {
  gameRevisionInput,
  notesWriteInput,
  soloNotesInput,
  notesOutput,
} from "../lib/contracts/gameplay";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  themeEditInput,
  themeCreateInput,
  themeRenameInput,
  moodCreateInput,
  moodEditInput,
  moodSchema,
  themeSchema,
  themeAvailability,
} from "../lib/contracts/themes";
import {
  requestCodeInput,
  verifyCodeInput,
  orderInput,
  emptyInput,
  accountSchema,
  orderSchema,
  premiumLibrarySchema,
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
  "/admin/privacy-requests": {
    get: {
      security: staffSecurity,
      "x-staff-role": "admin",
      responses: { "200": response() },
    },
  },
  "/admin/privacy-requests/{id}/review": {
    parameters: draftId,
    post: {
      ...staffPost(privacyReviewInput, "admin"),
      description:
        "Review deletion with expected revision and approved retention/backup references. Active rooms, staff access and all financial records prevent fulfilment. Eligible completion erases personal gameplay/preferences, revokes sessions, pseudonymises identity and records a recovery tombstone. No statutory retention periods are invented.",
    },
  },
  "/admin/privacy/deletion-ledger": {
    get: {
      security: staffSecurity,
      "x-staff-role": "admin",
      responses: {
        "200": {
          description:
            "Private no-store minimal deletion ledger attachment for isolated-restore replay",
        },
      },
    },
  },
  "/admin/themes": {
    post: staffPost(themeCreateInput, "content_publisher"),
    get: {
      security: staffSecurity,
      "x-staff-role": "editorial",
      responses: {
        "200": response(
          z.array(
            themeSchema.extend({
              reviewedCount: z.number().int(),
              ready: z.boolean(),
            }),
          ),
        ),
        "403": { description: "Editorial role and fresh MFA required" },
      },
    },
  },
  "/admin/themes/{slug}": {
    parameters: [
      { name: "slug", in: "path", required: true, schema: { type: "string" } },
    ],
    put: {
      ...staffPost(themeEditInput, "content_publisher"),
      description:
        "Update an existing stable theme. Requires publication switch, fresh MFA and expected revision. Retirement is denied while playable versions reference the theme. Promotion requires three reviewed eligible cases including free solo. IDs remain stable; slug changes use the separate managed rename endpoint.",
    },
  },
  "/admin/themes/{slug}/rename": {
    parameters: [
      { name: "slug", in: "path", required: true, schema: { type: "string" } },
    ],
    post: {
      ...staffPost(themeRenameInput, "content_publisher"),
      description:
        "Managed permanent slug rename retains UUID and frozen canon, reserves old slug as an alias and creates a 308 public redirect.",
    },
  },
  "/admin/moods": {
    get: {
      security: staffSecurity,
      responses: { "200": response(z.array(moodSchema)) },
    },
    post: staffPost(moodCreateInput, "content_publisher"),
  },
  "/admin/moods/{slug}": {
    parameters: [
      { name: "slug", in: "path", required: true, schema: { type: "string" } },
    ],
    put: staffPost(moodEditInput, "content_publisher"),
  },
  "/admin/releases/{key}/featured": {
    parameters: [
      {
        name: "key",
        in: "path",
        required: true,
        schema: {
          type: "string",
          maxLength: 80,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        },
      },
    ],
    post: {
      ...staffPost(featuredInput, "content_publisher"),
      description:
        "Set or remove a logical case's organic featured position (1–100). Requires fresh MFA and expected discovery revision. Setting a pick requires an enabled reviewed release and the publication switch; removing a pick remains available with publishing disabled. Does not change canon or first-publication identity.",
    },
  },
  "/admin/finance/revenue.csv": {
    get: {
      security: staffSecurity,
      "x-staff-role": "finance",
      description:
        "Export up to 31 inclusive UTC days of Paystack test sales and confirmed refunds by currency and play mode. Refunds use the date recorded in PlotRush. Amounts are in minor units before fees.",
      parameters: (["from", "to"] as const).map((name) => ({
        name,
        in: "query",
        required: true,
        schema: schema(financeRevenueQuery.shape[name]),
      })),
      responses: {
        "200": {
          description: "Sandbox revenue CSV attachment",
          content: { "text/csv": { schema: { type: "string" } } },
        },
        "400": { description: "Invalid UTC date range" },
        "401": { description: "Session required" },
        "403": { description: "Finance role and fresh MFA required" },
      },
    },
  },
  "/admin/finance/orders": {
    get: {
      security: staffSecurity,
      "x-staff-role": "finance",
      parameters: [
        {
          name: "search",
          in: "query",
          schema: { type: "string", maxLength: 100 },
        },
      ],
      responses: {
        "200": response(z.array(financeOrderSchema)),
        "403": { description: "Finance role and fresh MFA required" },
      },
    },
  },
  "/admin/finance/orders/{id}/reconcile-dispute": {
    parameters: draftId,
    post: {
      ...post(reconcileDisputeInput, disputeSummary),
      security: staffSecurity,
      "x-staff-role": "finance",
    },
  },
  "/admin/finance/orders/{id}/reconcile-refund": {
    parameters: draftId,
    post: {
      ...post(
        reconcileRefundInput,
        z.object({
          status: z.enum([
            "pending",
            "processing",
            "needs-attention",
            "failed",
            "processed",
          ]),
          refundedMinor: z.number().int().nonnegative(),
        }),
      ),
      security: staffSecurity,
      "x-staff-role": "finance",
    },
  },
  "/admin/finance/orders/{id}/close-refund-request": {
    parameters: draftId,
    post: {
      ...post(closeRefundInput, z.object({ closed: z.literal(true) })),
      security: staffSecurity,
      "x-staff-role": "finance",
    },
  },
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
      "Generated from runtime Zod contracts. Scope: account, order, daily and staff editorial routes. Staff editorial routes require protected roles and a fresh MFA cookie. Payment simulation is local-only. Paystack test checkout, verification and signed webhook acknowledgement are implemented; live billing remains gated.",
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
    "/solo/attempts": {
      post: {
        ...post(z.object({ caseId: z.string().min(1).max(80) }).strict()),
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            schema: { type: "string", format: "uuid" },
          },
        ],
        description:
          "Start/resume one active frozen case version. Seven-day database expiry, optional 24-hour actor-scoped request receipt. A replay does not replace a completed result or daily credit.",
      },
    },
    "/solo/attempts/{id}/notes": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        responses: { "200": response(notesOutput) },
      },
      put: {
        ...post(soloNotesInput),
        description:
          "Private autosaved notes; expectedNotesVersion fences independent note edits. Legacy expectedVersion writes remain supported. Maximum2000 characters.",
      },
    },
    "/solo/attempts/{id}/abandon": {
      parameters: draftId,
      post: {
        ...post(gameRevisionInput),
        description:
          "Explicitly end the owned attempt while preserving notes and unlocked evidence; ranked daily reservation remains.",
      },
    },
    "/solo/attempts/{id}/transcript": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        responses: {
          "200": {
            description:
              "Private uncached accessible text attachment of owned unlocked content/notes and revealed result only; no unreleased clues or unrevealed solution.",
          },
        },
      },
    },
    "/rooms/{id}/notes": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        responses: { "200": response(notesOutput) },
      },
      put: post(notesWriteInput, notesOutput),
    },
    "/rooms/{id}/resume": {
      parameters: draftId,
      post: {
        ...post(gameRevisionInput),
        description:
          "Original host only, expired recoverable room, two present returning members, paid ownership rechecked. Preserves frozen case, evidence, votes and assignments.",
      },
    },
    "/rooms/{id}/rehost": {
      parameters: draftId,
      post: {
        ...post(emptyInput),
        description:
          "Original host only for expired/cancelled rooms. Creates at most one linked replacement per interrupted room, rechecks current case/access, never charges guests or initiates payment.",
      },
    },
    "/rooms/{id}/transcript": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        responses: {
          "200": {
            description:
              "Owned membership-scoped accessible text attachment: own unlocked clues, shared evidence, own notes and revealed result; no other player's private clues/notes/votes.",
          },
        },
      },
    },
    "/rooms/{id}/events": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        description:
          "Authenticated SSE invalidations backed by the private durable room outbox. Data contains room revision only. Membership/session rechecked each second; connections bounded30 seconds and resumed from Last-Event-ID. Client refetches safe snapshot; polling fallback and separate heartbeats remain.",
        responses: {
          "200": {
            description:
              "text/event-stream with room_changed revision IDs and closed on access revocation",
          },
          "401": { description: "Session required" },
          "404": { description: "Membership required" },
        },
      },
    },
    "/me/interest-prompt": {
      get: {
        responses: { "200": response(z.object({ eligible: z.boolean() })) },
      },
    },
    "/me/interests/export": {
      get: {
        security: [{ session: [] }],
        responses: {
          "200": {
            description:
              "Owner-only uncached JSON attachment of UUID preferences; no email required",
          },
        },
      },
    },
    "/account/privacy-requests": {
      get: {
        security: [{ session: [] }],
        responses: { "200": response(z.array(privacyRequestSchema)) },
      },
    },
    "/account/export-request": { post: post(emptyInput, privacyRequestSchema) },
    "/account/delete-request": {
      post: {
        ...post(deletionRequestInput, privacyRequestSchema),
        description:
          "Fresh verified owner submits an auditable deletion request. Pending is not erased; financial and backup retention require operator review.",
      },
    },
    "/account/privacy-requests/{id}/cancel": {
      parameters: draftId,
      post: post(privacyRevisionInput, privacyRequestSchema),
    },
    "/account/exports/{id}": {
      parameters: draftId,
      get: {
        security: [{ session: [] }],
        responses: {
          "200": {
            description:
              "Fresh verified owner-only no-store account JSON attachment. Includes own notes/summaries/memberships/orders; excludes all case solutions and other players' private evidence/votes.",
          },
          "403": { description: "Fresh email verification required" },
          "404": { description: "Unknown or non-owned request" },
        },
      },
    },
    "/cases": {
      get: {
        description:
          "Safe deduplicated catalogue. OR within multi-value facets, AND across facets. Preview eligibility only; no owner overlay. Cursor binds canonical filters, page size, sort, market and catalogue revision. Stale cursors return409; reset cursor to restart.",
        parameters: [
          ...[
            "mode",
            "themes",
            "moods",
            "difficulty",
            "duration",
            "access",
            "sort",
            "cursor",
          ].map((name) => ({ name, in: "query", schema: { type: "string" } })),
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 24 },
          },
        ],
        responses: {
          "200": response(
            z
              .object({
                cases: z.array(z.object({ id: z.string() }).passthrough()),
                total: z.number().int(),
                revision: z.string(),
                nextCursor: z.string().nullable(),
                facets: z.record(
                  z.string(),
                  z.record(z.string(), z.number().int()),
                ),
              })
              .passthrough(),
          ),
          "400": { description: "Invalid filter or cursor" },
          "409": { description: "Retired filter or stale catalogue revision" },
        },
      },
    },
    "/discovery/facets": {
      get: {
        description:
          "Disjunctive theme/mood/difficulty/duration/access/mode counts and exact total from one catalogue snapshot.",
        responses: { "200": response() },
      },
    },
    "/me/interests": {
      description:
        "Owner-only UUID taxonomy references; returned IDs come from /themes. Legacy /interests remains compatible. Writes require expectedVersion; reads return preferenceVersion.",
      get: { responses: { "200": response(uuidInterestsSchema) } },
      put: post(uuidInterestInput, uuidInterestsSchema),
      delete: post(interestDeleteInput, uuidInterestsSchema),
    },
    "/themes": {
      get: {
        description:
          "Theme registry with distinct current preview counts under strict catalogue filters. Filters and legacy preferences use slugs; /me/interests uses persisted UUIDs. Retired entries have zero count. Reviewed supply excludes public draft fixtures. Counts/cases use one repeatable-read snapshot; no private player overlay.",
        parameters: [
          "mode",
          "access",
          "themes",
          "moods",
          "difficulty",
          "duration",
          "sort",
        ].map((name) => ({ name, in: "query", schema: { type: "string" } })),
        responses: {
          "200": response(
            z.object({ themes: z.array(themeAvailability) }).passthrough(),
          ),
          "400": { description: "Invalid filters" },
          "409": { description: "Selected theme retired" },
        },
      },
    },
    "/themes/{slug}": {
      parameters: [
        {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      get: {
        description:
          "Safe theme, eligible cards and explicitly labelled alternatives under the requested mode/access filters. Conflicting query theme is invalid. Retired API responses are 410 with safe alternative metadata; unknown slugs are 404.",
        responses: {
          "200": response(),
          "400": { description: "Invalid/conflicting filters" },
          "404": { description: "Unknown theme" },
          "410": {
            description:
              "Retired theme, with error.details.theme and alternatives",
          },
        },
      },
    },
    "/interests": {
      description:
        "Private preview interests use validated stable taxonomy slugs, not UUIDs. Legacy theme-only PUT requests preserve omitted mood/difficulty/opt-out fields. DELETE removes selections and disables personalisation; only a version tombstone remains for stale-write protection. Guest GET returns defaults without creating an identity. PUT can create a guest identity; DELETE requires an existing session.",
      get: { responses: { "200": response(interestsSchema) } },
      put: {
        ...post(interestInput, interestsSchema),
        responses: {
          "200": response(interestsSchema),
          "400": { description: "Invalid choices" },
          "403": { description: "Origin denied" },
          "409": { description: "Stale preference version" },
          "429": { description: "Write rate exceeded" },
        },
      },
      delete: {
        ...post(interestDeleteInput, interestsSchema),
        responses: {
          "200": response(interestsSchema),
          "401": { description: "Session required" },
          "403": { description: "Origin denied" },
          "409": { description: "Stale preference version" },
        },
      },
    },
    "/recommendations": {
      get: {
        description:
          "Private editorial-preferences-v4 recommendations. Defaults to free solo cases. Scores +3/+2/+1 for theme/mood/difficulty, then first publication descending and stable case UUID. No preferences or opt-out uses eligible publisher featured positions, then newest. Draft fixtures have no invented publication date. Filters and cross-mode/version exposure exclusion remain authoritative; exposedCount counts exposed keys and opt-in replays are separate.",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 10, default: 10 },
          },
          {
            name: "includeCompleted",
            in: "query",
            schema: { type: "boolean", default: false },
          },
          ...[
            "mode",
            "access",
            "themes",
            "moods",
            "difficulty",
            "duration",
            "sort",
          ].map((name) => ({
            name,
            in: "query",
            description:
              "Uses the strict catalogue filter contract; comma-separated values for themes, moods and difficulty.",
            schema: { type: "string" },
          })),
        ],
        responses: {
          "200": response(),
          "400": { description: "Invalid or repeated filters" },
          "429": { description: "Recommendation read limit exceeded" },
        },
      },
    },
    "/daily": { get: { responses: { "200": response(dailySchema) } } },
    "/daily/start": {
      post: {
        ...post(dailyStartInput),
        security: [],
        responses: {
          "201": response(z.object({ id: z.uuid() })),
          "400": { description: "Invalid UTC date or version identifier" },
          "403": { description: "Origin denied" },
          "409": { description: "UTC date or scheduled case changed" },
          "429": { description: "Too many requests" },
        },
      },
    },
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
    "/orders/{id}/refund-request": {
      parameters: draftId,
      post: post(refundRequestInput, orderSchema),
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
    "/me/premium": {
      get: {
        security: [{ session: [] }],
        responses: { "200": response(premiumLibrarySchema) },
      },
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
