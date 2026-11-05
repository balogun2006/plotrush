# 05 — Testing, deployment and operations

## 1. Environment separation

Create local, staging and production environments, each with isolated database/Auth/storage, payment keys, webhooks, ad settings, email configuration, admin identities and analytics. Preview deployments use staging/test providers and no live ads; never connect ephemeral previews to production DB or real checkout by default. Restrict staging access and noindex it. Do not rely on robots.txt as access control.

Provision production region near initial users with acceptable latency and service availability; London is a reasonable pilot default for UK/Nigeria mixed traffic, subject to measured latency and data-transfer review. Keep app/database compatible regions. Use a commercial-suitable hosting plan and managed backup capability. Pin Node runtime, dependency lockfile and migration checksums. Store secrets in host secret management, not git, seeds, client bundles or CI logs.

Actual external inputs needed: repository access, operating entity/support contacts, domain/DNS, hosting/Supabase accounts, transactional email sender, activated payment provider and keys, live Google approval/publisher identifiers when enabling Google, consent configuration, first-party content/art licences, and cleared sponsor orders/creatives when enabling campaigns. Absence of Google or sponsor assets must not block free game deployment; absence of live checkout keys disables checkout explicitly rather than presenting a false working button.

## 2. Local bootstrap contract

The implementation repository must provide the following working scripts (not implemented by this planning package):

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:reset
pnpm content:validate
pnpm content:import -- --input content/drafts/starter_cases.json --status draft
pnpm dev
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
```

Initial repository creation necessarily installs dependencies once without frozen lockfile, then commits it. `db:reset` is local-only; script must refuse any production host. Document Docker/CLI prerequisites for local Supabase. Provide `.env.example` with no real secrets. A seed staff identity is local-only and cannot be created in production from hardcoded credentials. Content importer is idempotent by case key/version/checksum and never auto-publishes.

This handoff includes a separate runnable `validate_starter_cases.py` to check the supplied fixtures. Its passing result means structural/reference validation only, not a tested game or approved story.

## 3. Test requirements

### Domain and database tests

- Solo: current-round projection, advancing, answer IDs, immutable first result, replay not altering streak, UTC rollover and missing-release fallback.
- Group: 4/5/6-player distributions; tutorial 2–6; simultaneous joins at capacity; unauthorised start; simultaneous advances; stale versions; heartbeat and disconnect promotions; future clues not exposed; host transfer; voting tie/abstention; all disconnect; room expiry and refresh catch-up.
- Access: anonymous authenticated role distinction; cross-account order/attempt access; user cannot self-assign staff; host cannot fetch other evidence/votes; nonmember cannot subscribe to private room; exposed DB tables/Storage comply with RLS; no answer in initial HTML/network/bundles.
- Money: valid signed webhook, altered raw-body rejection, duplicate delivery, callback/webhook race, currency/amount mismatch, late success on expired quote, provider outage, incorrect environment, two checkout clicks, successful refund, failed refund, duplicate refund callback, duplicate ownership and partial refund sum limits.
- Ads: eligibility, paid-session exclusion, consent denied, country unknown, campaign overlap, schedule/cap edge, concurrent final impression reservation, expired reservation, event replay, hidden tab, staff traffic, invalid destination, paused campaign, Google no-fill/blocked, fake reward completion only granting bounded hint, never premium access.
- Jobs: duplicate scheduler invocation, expired lease, retry after crash, partial batch continuation, webhook inbox failed persistence, receipt retry without duplicate fulfilment.

Integration tests execute real migrations and PostgreSQL constraints/RLS with realistic anon/authenticated/staff tokens. Do not verify authorisation solely by mocking a true/false function. Payment tests use deterministic fakes for edge cases plus provider sandbox smoke tests. Never click live Google ads in tests or generate synthetic paid advertiser impressions in production.

### Browser flows

Use isolated browser contexts to simulate separate people. One test must run full paid-case group journey for four contexts against the database and realtime service; another runs five/six distribution. Test solo anonymity, account upgrade and resumption after verified login, purchase/test verification, lobby link and room code, reconnect after network loss, private clue sharing, result export and direct campaign admin/reporting. Browser offline does not imply full offline support: show cached visual shell plus reconnect, never accept authoritative votes offline without later server validation.

Manual mobile QA: Samsung-class Android/Chrome, iPhone/Safari, desktop keyboard and screen reader, portrait landscape, 360px screen, reduced motion and slow mobile data. Test browser back, tabs, duplicate tabs, interrupted checkout and refreshed invite link. Do not claim device coverage without actual device/emulation evidence; record which was used.

### Load and reliability

Stage-load 100 four-player rooms plus 1,000 staggered solo clients; disclose synthetic workload, dataset, duration, service tiers and measured latency/error rate. Focus on joins/start/round deadlines/vote convergence. Drive catch-up and reconnect bursts. Cap test cost and obtain required provider permission for load tests; never direct synthetic traffic at Google ads, live checkout or sponsor billing. If platform plan is too small, establish safe tested concurrency and admission controls rather than claiming the target passed.

## 4. CI/CD pipeline

On pull request: frozen install → secret/dependency checks → lint/typecheck → unit tests → isolated DB migrations/integration tests → content validation → production build → browser smoke → preview deployment. Store reports, screenshots and failure traces without secrets or player PII. External service tests skipped only with explicit reason; required security/money checks cannot be marked passed by omission.

On release candidate: tag/commit SHA → backup confirmation → staging migration rehearsal → full staging smoke including test webhook and four-player game → review feature flags/content queue → deploy production-compatible additive migrations → app deployment → smoke test → enable feature flags gradually. Migration job uses dedicated least-privilege deploy credential, not a browser token. Allow only one migration deployment at a time.

Use expand/contract migrations: add nullable/new structures first, backfill safely, deploy compatibility code, remove old columns in a later release after older app versions are gone. App rollback alone does not roll back database state. Never run automatic destructive down migrations in a production rollback.

## 5. Production setup sequence

1. Create production DB/Auth/storage and choose backup/PITR configuration. Record restore capability and actual plan limits; create separate staging.
2. Deploy schema with RLS/grants, seed metadata and draft content. Verify no default public read grants leak private schemas.
3. Configure anonymous auth, email sender/verified identity flow, CAPTCHA/rate limits, permitted redirects and MFA for staff. Use exact production domain, not broad wildcard redirects.
4. Set host environment variables and feature flags; default payments/Google/direct ads off. Configure nonpublic server keys and dedicated least-privilege admin bootstrap.
5. Deploy app, configure domain/TLS/security headers, consent layer, privacy/support pages and incident contacts. Block indexable private routes and scrub social metadata.
6. Configure real provider webhook URL `/api/v1/webhooks/paystack` and event/environment mapping. Replay sandbox events in staging only. Confirm checkout uses hosted provider and exact order currency.
7. Publish approved content versions and daily schedule, retaining seeds as drafts if not yet reviewed. Record art rights and blind-test outcomes.
8. Set scheduler endpoint authentication using CRON_SECRET; test lease/idempotency and alerts. Configure room lazy catch-up independently of scheduler.
9. Verify observation, reports, staff MFA, backups, consent refusal, deletion/export workflow and emergency flags.
10. Open invited free pilot. Enable payment only after tests, merchant activation, receipt/refund terms and an authorised live payment/refund check. Enable direct campaigns only with cleared payment and approved bookings; Google only after actual approval and consent setup. Each provider can be enabled independently.
11. Open public beta within measured capacity; monitor real users before increasing acquisition.

If deployed through a different host/Sites flow, preserve requirements for durable DB, private realtime, authenticated API routes, raw webhooks, cron fallback and external secrets. A static HTML export or in-memory room store does not satisfy this plan.

## 6. Launch gates and evidence

| Gate | Evidence |
|---|---|
| Visual fidelity | Mobile/desktop screenshots matching approved palette, layout and primary journeys |
| Core product | Solo and four-browser group completion recordings/tests |
| Content | Published version checksums, approvals, two premium cases and daily queue for broad launch |
| Security | RLS tests, private-channel tests, no secret/answer leakage, staff MFA |
| Financial | Sandbox cases pass; real merchant setup and authorised live checks before charging |
| Advertising | Paid-session exclusions, direct cap/dedup tests, honest report; Google approval only if enabled |
| Accessibility | Keyboard/focus/contrast/transcripts, documented manual checks |
| Reliability | Tested concurrency, reconnect, scheduler-late path, restore rehearsal |
| Operations | Support contact, incident owner, payment exception queue, rollback steps |

An invited alpha may launch with fewer content cases and payments/ads disabled, clearly labelled as alpha. A broad daily-content marketing launch cannot claim daily new cases without the queue. Report every unmet gate explicitly. No claim of production readiness because a build compiled.

## 7. Observability and runbooks

Log structured request ID, hashed actor, domain event, context ID, latency, safe error code and provider correlation reference; no secrets, full webhooks, email, notes or clue content. Error monitoring must scrub URLs containing auth tokens/invite codes. Use low or disabled session replay and never record private clues/notes/payment forms.

Alerts: API error rate>2% for five minutes; p95>1.5s for ten minutes; payment verification pending>10 minutes; webhook inbox oldest>5 minutes; scheduler lease stale>2 intervals; ad campaign cap inconsistencies; content queue<7 days; database/storage/cost thresholds. Set an actual owner/channel without unsolicited external messages. These are initial operational thresholds, tune from baseline.

**Payment outage:** disable new checkout, continue game access for existing owners, keep signature/inbox processing live, show pending state, retry verification, reconcile provider transactions, contact affected players only through authorised support workflow. Never ask them to pay again while payment status is unresolved.

**Room/realtime outage:** show reconnect status, keep local notes draft, poll safe state every five seconds with backoff; server/database remains authority. Timed investigation uses server deadlines; lazy advancement handles recovery. Promote missing clues by rules. Rehost without new charge if session cannot recover; preserve original trace for diagnosis.

**Ad incident:** pause campaign or Google flag immediately, stop new requests, disable offending creative; separate invalid events from historical counters through an audited correction. Do not delete advertiser report history. Inform advertiser via authorised commercial process and apply contract remedy.

**Content flaw:** withdraw new starts for affected version, retain frozen attempts unless impossible/unsafe, issue correction/support option, create reviewed new version and preserve original answer/result history. No silent retrospective grading changes.

**Leak/security incident:** restrict compromised functionality, rotate relevant secrets, invalidate sessions where required, preserve minimal evidence, assess data impact and applicable notification obligations with the incident owner. Retest affected access paths before reopening. Never publish sensitive incident details in public game UI.

## 8. Backup, rollback and retention

Initial objectives: RPO≤24h and RTO≤4h for pilot, improve to RPO≤1h before scaling paid operations if chosen provider plan supports it. These are targets, not guarantees; prove them in restore rehearsal. Daily encrypted DB backup/managed equivalent, separate private asset backup/versioning, tested content export and secure access to recovery credentials. Keep finance references so provider history can reconcile payments after restore. Restore to a new isolated environment first; do not overwrite production blindly.

Rollback: disable affected feature flags → redeploy prior compatible app SHA → maintain database schema compatibility → verify access/payments → process accumulated webhooks once → inspect counts and incidents. For destructive migration failure use tested restore/forward repair with finance reconciliation; never erase later payments by restoring blindly.

Initial data minimisation defaults: anonymous inactive identities/unfinished attempts 30 days after expiry; private room notes 30 days; room gameplay history 90 days; raw ad events 90 days; short-lived decisions/nonces 24h; frequency identifiers≤7 days; aggregated nonidentifying reports up to24 months; rate-limit IP hashes24h. Auth backups and player/account retention must be reflected in policy. Keep account-owned purchases/results until deletion request or policy expiry. Financial/audit records follow applicable mandatory retention periods, reviewed for actual operating entity; pseudonymise deleted accounts where lawful while preserving required transaction references. Document restoration handling so deleted accounts are not silently resurrected from backup. Do not delete an anonymous auth principal still hosting an active room, associated with unresolved payments or upgraded to permanent identity.

## 9. Handover after implementation

Deliver repository URL/commit, staging and production URLs if actually deployed, environment-variable names (no values), architecture decisions, schema migration list, approved/unapproved content, CI outputs, browser/load evidence, payment/ad provider states, known issues and operating runbook. Provide exact commands to reproduce and a release manifest. State what is mocked, sandboxed, disabled or externally blocked. Include remaining owner actions with consequence and next concrete step; do not describe unexecuted tests or unavailable third-party approvals as complete.

## 10. Theme rollout and migration gate (v1.1)

Run MN-025–031 tests before R2 release. For an existing build: add taxonomy and nullable metadata/interests structures; seed taxonomy idempotently by stable slug; backfill reviewed content mapping; validate reference/mode-duration completeness; create public metadata projection and indexes; deploy dual-read-compatible code; enable new theme UI only after data readiness. Never publish drafts to populate categories. New installs import current1.1 fixtures. Legacy1.0 drafts can import into review queue but cannot publish without complete metadata. Running games keep prior snapshots; no reset of purchases, first results or member assignments.

Stage-test old links, new shareable filter URLs, query bounds, anonymous preference upgrade/merge/deletion, mode-specific duration boundaries, multi-tag deduplication/facets, recommendation exclusion/fallback and paid-session ad suppression. Test existing-data migration and rollback; keep added schema when rolling back application code, invalidate discovery caches and disable new UI with FEATURE_THEME_DISCOVERY if necessary. Broader feature flags cannot expose unpaid content. Theme launch readiness report must show ≥3 promoted shelves with ≥3 distinct eligible games and ≥1 free solo case each before broad theme-led promotion; sparse alpha stays labelled. Add taxonomy/preference/recommendation errors and no-result rates to monitoring without raw personal preference snapshots.
