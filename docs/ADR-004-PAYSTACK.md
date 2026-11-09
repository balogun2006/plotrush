# ADR004: sandbox Paystack checkout, durable inbox and reconciliation

7 November 2026. Extends ADR003; approved Railway hosting retained.

Checkout persists a stable Paystack reference before the network request, leases initialization, validates the returned hosted-checkout origin and stores its URL. An uncertain result never creates a second attempt. Orders use server prices, verified buyers and mode-specific ownership. Live checkout is intentionally unavailable while this application serves public draft fixtures. An explicit sandbox catalogue flag permits only two allowlisted fixture products, never arbitrary inactive inventory.

The webhook route reads bounded raw bytes and verifies HMAC before parsing. Current Paystack documentation describes `Paystack-Signature` with timestamp and keyed v1 signatures; a separate signing secret plus optional previous secret supports rotation. Timestamp skew is bounded to five minutes. Legacy API-key HMAC is opt-in only and cannot downgrade an invalid modern header. Provider unsigned 64-bit transaction IDs are retained as strings. Only minimal event fields are persisted, never card authorization metadata or raw event bodies.

A durable, deduplicated PostgreSQL inbox is acknowledged before independent API verification. A separate Railway cron claims bounded batches with SKIP LOCKED and expiring leases. It also verifies pending attempts to recover missing callbacks/webhooks. Owner-only verification provides prompt feedback after checkout. Fulfilment locks order then attempt, verifies amount/currency/reference/environment, fences provider transaction IDs and grants ownership once. Late verified success can fulfil an expired quote. Duplicate purchases create an audit entry for manual review. Email confirmation uses an independent retryable outbox; financial completion never depends on mail delivery.

`FEATURE_PAYMENTS` stops new checkout only. Webhooks, owner verification and reconciliation remain available for already-started payments. Worker configuration uses private service references, no public endpoint and no second set of owner-entered keys. [Railway variables and activation runbook](RAILWAY-VARIABLES.md) defines exact settings.

Automated tests use controlled provider transports and test signatures, real SQL transactions and the compiled Next application. They do not prove a merchant key, sending-domain approval or an actual Paystack test payment. Those external smoke checks need owner-supplied credentials. MN-012 remains incomplete for live billing, refunds, approved premium content/gameplay, manual-review tooling, provider outage drills and production certification.

Provider documentation consulted on 7 November 2026:

- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/accept-payments/

If the merchant dashboard exposes only legacy signing, use the explicit compatibility flag in the runbook. Do not assume a signing secret is identical to the API key.
