# ADR 003: verified account and order foundations

6 November 2026. Extends the draft preview after PR #2; not a production or revenue launch.

## Account identity

The existing opaque cookie remains the session credential. An email address alone grants nothing. Requesting a login creates a browser-principal-bound challenge with a random eight-digit code, HMAC-SHA256 digest, ten-minute database expiry and five persisted attempts. Codes never appear in URLs or application logs. Sending a new code invalidates older challenges for the principal. Delivery failure invalidates its challenge; successful verification consumes it, rotates sessions and records an audit event. Per-email/per-principal limits supplement guest creation and request limits.

New email verification attaches the account to the same principal so solo progress, interests and group seats remain unchanged. Returning email authentication requires a fresh code and explicit confirmation before combining the new guest with the existing account. Both histories remain: where both have the same active case version, the incoming attempt is archived read-only with its notes rather than replacing destination notes. Interests combine destination-first with a six-theme cap. Completed room memberships and historical assignment/vote identity references migrate under room locks. The final group result is never recalculated.

A cross-principal merge is deferred while either identity has non-departed membership in a nonterminal group room. Finish or leave first, then retry the still-valid code. Upgrading a new email on the same identity works during a game. Staff-assisted recovery, MFA, staff roles, deletion/export requests and retention cleanup are still unimplemented. These limitations keep MN-003 partial.

Principal row locks fence gameplay mutations so a request authenticated before a merge cannot create new progress under the retired guest after the merge. Merged principals remain as audit references and their sessions no longer authenticate.

## Email delivery and development isolation

The Resend adapter uses a bounded server-side `POST /emails` with bearer authentication and a challenge-specific Idempotency-Key. No real email is sent during development tests. A local test code is returned and visibly labelled only for a nonproduction runtime or the production-build test harness with APP_MODE=test and both application/database hosts at127.0.0.1. A Railway deployment cannot enable this local adapter through EMAIL_PROVIDER=development alone.

Staging serves an honest unavailable account state until all configuration is ready:

| Variable           | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| FEATURE_EMAIL_AUTH | Must be `true` to use real delivery                                                       |
| EMAIL_PROVIDER     | `resend`                                                                                  |
| RESEND_API_KEY     | Real server-only Resend sending key; `replace_me` disables delivery                       |
| EMAIL_FROM         | Sender on a verified domain supplied by the owner; not invented in code                   |
| AUTH_CODE_SECRET   | Independent random server secret with at least32 characters; keep stable across instances |

The adapter is implemented and locally tested; actual provider delivery, domain verification and email ownership on staging are not claimed. Configure and test delivery before enabling acquisition or paid access. Marketing consent is separate and no marketing list is created.

Primary API documentation checked during implementation: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/blog/engineering-idempotency-keys .

## Products and orders

Mode-specific products and immutable price versions store integer minor units and ISO currency. Two inactive draft products and NGN test quotes exist for the public Wedding Gift fixture. These are development examples, not an approved public price or playable premium release. Production products remain inactive.

Creating an order requires a verified account and accepts product ID, price-version ID and UUID idempotency key. The server resolves price; extra client amount/currency fields are rejected. The same key replays the same order only for an identical product/price/environment. Ownership and order reads are owner-scoped. Payment attempts have unique provider references and transaction IDs.

The shared fulfilment transaction verifies successful status, exact integer amount/currency/environment and stored reference; duplicate provider results grant once. A late verified success may fulfil an expired quote. A transaction cannot be applied to two orders. Ownership is unique per principal/product and preserves solo/group separation. There is no browser success-query fulfilment path.

The only reachable payment provider is a labelled, deterministic local development simulation. Deployed `/orders` and `/orders/:id/development-payment` fail closed, regardless of Paystack placeholder keys or FEATURE_PAYMENTS. Real Paystack initialisation, signed webhook inbox, provider verification/reconciliation, receipts/outbox, refunds and finance exceptions are MN-012/013 work. Do not wire the domain fulfilment function to a browser JSON success event. Purchased gameplay is not unlocked in this milestone.

`/shop` is a development payment laboratory locally and a premium-coming-soon screen on Railway. `/account` preserves free play when email is unavailable. Payment/ad flags remain independent; no ad inventory is served.

## Migration and rollback

003 adds accounts, challenges, audit events, products, prices, orders, attempts and entitlements privately with RLS enabled and PUBLIC grants revoked. It adds a merged principal reference and a read-only abandoned solo state. Re-running migrations does not reset case progress or activate products. Roll back by pinning the preceding application; do not drop the additive tables. After enabling real email/merges, review rollback compatibility for archived attempts before rolling back an old UI.

Generated OpenAPI3.1 for the implemented account/commerce routes is in openapi-account-commerce.json, built from runtime Zod request schemas. `pnpm api:check` detects drift in CI. Gameplay/admin routes remain to be added before R1 exit; this is not a complete product API specification.
