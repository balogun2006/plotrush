# PlotRush Railway configuration

Use project **plotrush**, environment **staging**, service **plotrush-web**. Keep credentials in Railway, never in GitHub or chat. The integration supports **Paystack test transactions only** in this draft preview. Approved premium gameplay, live billing, refunds, ads and production operational certification remain separate work.

## Values the owner supplies

| Variable                  | Value                                                                                | Purpose                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`     | Your `sk_test_…` key                                                                 | Server-side checkout and transaction verification. Must match the test environment. |
| `PAYSTACK_WEBHOOK_SECRET` | Your test endpoint's `whsec_…` signing secret                                        | Timestamped `Paystack-Signature` validation. Distinct from the API secret.          |
| `RESEND_API_KEY`          | Your `re_…` key                                                                      | Email sign-in and optional purchase confirmations.                                  |
| `EMAIL_FROM`              | A sender on your verified Resend domain, e.g. `PlotRush <hello@your-domain.example>` | Authorised sending identity. Use your own domain.                                   |

These names already exist on staging with placeholders or an empty sender; replace the values. No public Paystack key is needed: the server initializes hosted checkout. The older `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` placeholder is unused.

## Activation switches

After entering valid **test** credentials and configuring the endpoint below, set:

| Variable                    | Value  | Effect                                                                                                               |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `FEATURE_EMAIL_AUTH`        | `true` | Allows verified email accounts. Required before a buyer can create an order.                                         |
| `FEATURE_PAYMENTS`          | `true` | Allows new sandbox orders and hosted checkout. Turning it off leaves verification and reconciliation running.        |
| `FEATURE_SANDBOX_CATALOGUE` | `true` | Exposes only the two known, labelled draft test products. These prices are fixtures, not approved commercial prices. |
| `FEATURE_PAYMENT_RECEIPTS`  | `true` | Allows queued payment confirmations through Resend. Optional; failed email never removes a verified purchase.        |

Defaults remain `false` until configured. This release refuses live checkout even if a live key is entered. Do not switch `PAYSTACK_ENVIRONMENT` to live for this preview.

## Already configured — preserve

| Variable                                   | Value / guidance                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `PAYMENT_PROVIDER`                         | `paystack`                                                                |
| `PAYSTACK_ENVIRONMENT`                     | `test`                                                                    |
| `PAYSTACK_ALLOW_LEGACY_WEBHOOKS`           | `false`                                                                   |
| `EMAIL_PROVIDER`                           | `resend`                                                                  |
| `APP_URL`                                  | `https://plotrush-web-staging.up.railway.app`                             |
| `DATABASE_URL`                             | `${{Postgres.DATABASE_URL}}` — private service reference                  |
| `AUTH_CODE_SECRET`                         | Already generated securely; preserve it. Never replace with `replace_me`. |
| `PREVIEW_MODE`                             | `true`                                                                    |
| `PORT`                                     | `3000`                                                                    |
| `NEXT_TELEMETRY_DISABLED`                  | `1`                                                                       |
| `FEATURE_DIRECT_ADS`, `FEATURE_GOOGLE_ADS` | `false` — independent integrations still outstanding                      |

Optional `PAYSTACK_WEBHOOK_SECRET_PREVIOUS` accepts the previous signing secret during a short rotation window; remove it after rotation. If Paystack supplies only the legacy `x-paystack-signature` format for your account, explicitly set `PAYSTACK_ALLOW_LEGACY_WEBHOOKS=true`; the API secret then verifies that legacy format. An invalid modern signature never falls back to legacy. Prefer the timestamped format with its separate signing secret.

## Paystack dashboard

Configure the **test** webhook URL:

```
https://plotrush-web-staging.up.railway.app/api/webhooks/paystack
```

Subscribe to `charge.success`. The application acknowledges a valid event only after saving it to PostgreSQL. The worker performs independent provider verification before fulfilment. Unknown signed event types are recorded as ignored. Never enable unsigned test payloads on this deployed endpoint.

Return URLs are set by the server as `APP_URL/orders/<order-id>`; there is no callback variable to enter. Query-string success or a redirect alone never grants access. On return use **Check payment status**, or let the worker reconcile.

## Private cron worker

Service **plotrush-payments-worker** uses the same source commit as the web service:

- Build: `pnpm api:check` (Railpack installs dependencies).
- Start: `pnpm payments:work`.
- Cron: `*/5 * * * *` (UTC), restart `NEVER`, no public domain or HTTP healthcheck.
- No migration command; deploy the web service/migration first.

Its variables reference the web service so secrets are entered once:

| Worker variable            | Railway reference                            |
| -------------------------- | -------------------------------------------- |
| `DATABASE_URL`             | `${{Postgres.DATABASE_URL}}`                 |
| `APP_URL`                  | `${{plotrush-web.APP_URL}}`                  |
| `PAYSTACK_ENVIRONMENT`     | `${{plotrush-web.PAYSTACK_ENVIRONMENT}}`     |
| `PAYSTACK_SECRET_KEY`      | `${{plotrush-web.PAYSTACK_SECRET_KEY}}`      |
| `FEATURE_PAYMENT_RECEIPTS` | `${{plotrush-web.FEATURE_PAYMENT_RECEIPTS}}` |
| `RESEND_API_KEY`           | `${{plotrush-web.RESEND_API_KEY}}`           |
| `EMAIL_FROM`               | `${{plotrush-web.EMAIL_FROM}}`               |

After updating the web variables, redeploy the web service and the worker so both resolve the new values. No signing secret is needed on the worker. With a placeholder API key it exits successfully with `payment_worker_disabled`; this is an idle configuration check, not proof of a real transaction.

## Activation smoke test

1. Verify email delivery on `/account`; free solo still works signed out.
2. On `/shop`, confirm the explicit sandbox label. Create one draft test order, complete Paystack's test checkout, return and check payment status.
3. Confirm the order is paid and ownership saved exactly once. Replay a signed event and run verification again: no second entitlement or receipt row.
4. Confirm a webhook inbox event reaches done and the next cron run processes any pending work. Turn off new checkout and verify an already-started payment can still complete.
5. Confirm receipt email if enabled. Retry email failure without changing order or ownership.
6. Do not advertise premium access: paid gameplay is not released. Record the actual provider test before calling the integration externally verified.

## Recovery

The worker claims bounded batches with PostgreSQL leases. After a crash, inbox/receipt leases expire in three minutes and are reclaimed. Pending attempts are rechecked every five minutes; delayed provider success can fulfil an expired quote. Uncertain initialization retains its reference and is never blindly initialized a second time. Check status before creating another order.

Inspect `app_private.webhook_inbox` rows in `exception` and `audit_events` with `duplicate_purchase_review` privately. Correct provider/account configuration, compare reference/amount/currency/environment/transaction ID and consult provider records before retrying or refunding. No automatic refund is implemented. Permanent mismatches never grant access; do not manually mark an order paid. A signed unknown reference is quarantined, not trusted. Email delivery is at least once with provider idempotency; the database grant and receipt enqueue are once per order. Never paste personal data, secrets or raw provider/card payloads into logs or issues.
