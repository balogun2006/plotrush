# Railway preview deployment

Project: `plotrush` (`1ae349d0-6e8e-4ab9-abee-55868832513b`).
Environment: `staging` (`8ae34e43-3aea-4c31-be65-aa09089d9335`).
Postgres: `2cb4eba1-d982-4772-8811-01fdfb8d3ff9`, private PostgreSQL 18 service with persistent volume.

Do not deploy into VultPay projects. Do not use the existing public draft canon for a production launch.

## Service configuration

Connect `balogun2006/plotrush`, branch `feat/railway-playable-alpha`, root repository. Railpack reads Node24 and pnpm from package.json. Explicitly apply the settings recorded in `railway-service-settings.json` through Railway update-service or the dashboard: build `pnpm build`, pre-deploy `pnpm db:migrate`, start `pnpm start`. The platform deprecated/ignored the legacy railway.json approach; do not rely on it. This record is not auto-applied. Health path `/api/health` checks the database. Configure:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (reference; never paste a resolved credential).
- `PREVIEW_MODE=true`.
- `APP_URL=https://<actual generated application domain>`.
- `NEXT_TELEMETRY_DISABLED=1`.

The application binds Railway's PORT through Next.js. No database TCP proxy is required. Generate one app domain, set APP_URL to that exact origin, then redeploy. Mutations reject other Origin headers. Payments and ads have no implemented routes and remain disabled. Do not enable a production environment until account, content, operations and release gates are met.

## Verification

Wait for Railway deployment status SUCCESS, not merely a queued build. Verify `/api/health`, catalogue privacy, a new guest's complete play/reload/result, cross-session denial, CSRF rejection and mobile layout on the deployed origin. Record actual evidence and deployment SHA in implementation-status.md.

## Rollback and recovery

Redeploy a known successful commit to roll back application code. The first schema migration is additive and idempotent; do not drop guest tables to reverse a code release. Before future schema changes, enable/schedule backups, record a successful backup and rehearse restore into an isolated service. This initial preview has not completed a restore rehearsal and is not approved for important user data. Configure service monitoring and resource/spend alerts before acquisition. No backup, retention or monitoring is implied by the existence of a persistent volume.

## First deployment correction

The first container started without the legacy file’s migration/healthcheck settings. API readiness returned 503 even though the container deployment said SUCCESS. Service settings were applied explicitly through the Railway connector and the application redeployed. Always verify actual `/api/health` and gameplay, and inspect resolved service settings rather than trusting a container status alone.

## Verified release

Source `eb8493918ebac50628c5ea1c28aab045a2e42196`, deployment `e6f83ec8-2edf-4f09-80d4-b5dc752b4306`, status SUCCESS. Health returned ok/draft-preview, and a complete hosted solo game plus saved notes/results/interests and discovery filters were checked in the cloud browser. Source is pinned; documentation changes do not trigger another release.

Use a fresh source deployment after changing lifecycle settings and read back the effective configuration. A cached-build redeploy in this session did not resolve the missing migration. The successful fresh deployment logged the migration before startup.
