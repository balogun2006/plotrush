# Implementation status

Updated 8 November 2026. First playable **draft preview**; no alpha/beta or production launch is claimed.

## Delivered slice

Guest solo play, database-backed notes/hints/results, discovery filters, private interests, recommendations and case library. Three free solo drafts and the free 2–6 player group tutorial are implemented. Purchase-based premium solo and group gameplay is implemented behind a disabled staging flag. Accounts/orders, Paystack sandbox integration and a protected editorial studio are implemented behind configuration/release gates. Actual provider acceptance, approved launch content and ad integrations remain outstanding. Public fixture solutions remain examples.

## Verification

- Production build, TypeScript and ESLint checks passed locally after the database recovery change.
- 22 SQL/domain tests passed: ownership denial, opaque sessions, stale writes, immutable concurrent accusation results, hints, notes, interest isolation, rate counters and discovery boundaries.
- Six Playwright scenarios passed against the compiled production app, PostgreSQL wire adapter and disposable PGlite server: desktop/mobile completion and refresh, filter URL/empty states, cross-browser denial and Origin rejection.
- Browser download was unavailable; the local run used a registry-packaged Chromium 153 executable via TEST_CHROME_PATH. Standard CI installs Playwright Chromium. The tests passed after fixing pre-hydration clicks and accessible radio labels; the initial failures are not counted as passes.
- Supplied Python fixture validator passed for all five drafts; this is structural validation, not independent content playtesting.

## Ticket map

| Ticket | State               | Evidence / remaining work                                                                                                                                                                                                                   |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MN-001 | Implemented locally | Scaffold, pinned dependencies, lockfile, scripts and CI definition. GitHub CI passed for deployed commit eb8493918ebac50628c5ea1c28aab045a2e42196.                                                                                          |
| MN-002 | Partial             | Purple/ivory/lime responsive home, catalogue, game, interests, library and loading/error states. Modal/filter-sheet and full accessibility audit pending.                                                                                   |
| MN-003 | Partial             | Opaque guest sessions, private schema, owner checks and negative-access tests. Email upgrade and explicit merge foundations implemented; live delivery and runtime least privilege pending; protected staff roles and TOTP are implemented. |
| MN-004 | Partial             | Five checksum-addressed draft imports, Zod validation, safe metadata projection. Publication/editorial workflow pending.                                                                                                                    |
| MN-005 | Partial             | Three free solo drafts, resumable attempts, version checks, atomic immutable results. Daily editorial releases, streaks, seven-day expiry and ranking pending.                                                                              |
| MN-006 | Partial             | Private saved notes, free hints, explanation and spoiler-free text share. Autosave, rendered share cards and broader accessible export pending.                                                                                             |
| MN-007 | Partial             | Free tutorial lobby, invite and atomic capacity/start checks. Paid entitlement and general request idempotency pending.                                                                                                                     |
| MN-008 | Partial             | Private round assignments, authorised sharing and board. Polling replaces realtime; outbox and room notes pending.                                                                                                                          |
| MN-009 | Partial             | Heartbeats, host transfer, deadline catch-up, pause/expiry and evidence promotion. Verified recovery and paid rehost pending.                                                                                                               |
| MN-010 | Partial             | Private immutable votes, tie/abstention rules and persisted joint reveal for the free tutorial. Paid/full release QA pending.                                                                                                               |
| MN-011 | Partial             | Email challenges/upgrades/explicit merges, server-priced idempotent orders, mode-specific ownership and local payment simulation. Live delivery/checkout pending.                                                                           |
| MN-012 | Partial             | Paystack sandbox checkout, signed inbox, reconciliation and receipt outbox implemented/tested/deployed; actual provider acceptance and live release pending.                                                                                |
| MN-013 | Partial             | Sandbox refund requests, finance reconciliation, recovery worker, dispute holds and sandbox revenue export. Live payments and provider-backed dispute acceptance remain open.                                                                 |
| MN-014 | Partial             | Protected studio, independent review, immutable releases/withdrawal, UTC calendar and queue-gap indicators implemented. Rich-media tooling and full editorial operations pending.                                                           |
| MN-015 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-016 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-017 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-018 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-019 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-020 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-021 | Partial             | Local checks and desktop/mobile E2E for enabled solo scope; no full security/performance/accessibility/load certification.                                                                                                                  |
| MN-022 | Partial             | Railway staging application and PostgreSQL deployed; live browser solo smoke passed. Backup/restore and multiplayer drills pending.                                                                                                         |
| MN-023 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-024 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-025 | Partial             | Taxonomy constants, draft metadata validation and safe projection. Relational taxonomy/versioned editorial backfill pending.                                                                                                                |
| MN-026 | Partial             | OR/AND filters, mode durations, counts, URL state and honest empty results. Multi-select filter UI, themes routes, retired slugs and pagination pending.                                                                                    |
| MN-027 | Partial             | Optional private guest interests with save/clear/revision conflicts. Verified-account merge implemented; deletion/export and retention flows pending.                                                                                       |
| MN-028 | Partial             | Saved-theme overlap ranking with stable fallback and completed-case exclusion. Full chapter07 weighted scoring and editorial fallback pending.                                                                                              |
| MN-029 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-030 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |
| MN-031 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                                                                                                          |

## Railway scope

- Project `plotrush`: `1ae349d0-6e8e-4ab9-abee-55868832513b`.
- Environment `staging`: `8ae34e43-3aea-4c31-be65-aa09089d9335`.
- PostgreSQL service `2cb4eba1-d982-4772-8811-01fdfb8d3ff9` reached SUCCESS.
- Web service `bef0eb3f-0e3c-40bd-8d5b-c6b2c7c27746` configured with private DB reference, PREVIEW_MODE, fixed origin and port. The exact source commit and successful deployment are recorded below.
- Reserved application origin: `https://plotrush-web-staging.up.railway.app` (health and manual gameplay verified).

## Repository and next work

PR #1 was merged into main at `a0928624d2d301c7dfb40b221a2b6aa95a811a22`. New work is on `feat/group-tutorial`. GitHub connector writes return 403 and shell git push lacks credentials; source was committed through the owner-authenticated GitHub web UI. All 68 project files matched the tested workspace before first deployment. Subsequent startup/configuration corrections were separately tested and committed.

Continue with complete MN-003 account/role foundations and MN-007–010 durable group flows, then verified accounts/commerce, editorial tools, direct ads and Google adapters at their dependency points. Keep discovery core work alongside these tickets. See ADR-001-RAILWAY.md for all preview deviations.

## Verified staging release

- Application source: `eb8493918ebac50628c5ea1c28aab045a2e42196`. The Railway service is pinned to this commit; later documentation commits do not auto-deploy.
- Successful deployment: `e6f83ec8-2edf-4f09-80d4-b5dc752b4306`. Railway status SUCCESS observed.
- `/api/health` returned `{"status":"ok","mode":"draft-preview"}` in the cloud browser.
- Migration logs confirmed `Schema ready; draft preview content imported.` before application startup. The service’s explicit build, migration, start and healthcheck settings were read back through Railway. The deprecated railway.json file was removed from the branch.
- Hosted manual browser check: start free solo without email/payment/ad/invitation; open evidence; grant a free hint; save notes; refresh and recover notes; submit suspect and reason; see 100/100 and explanation; refresh and recover the same result; view the result in My cases.
- Hosted interests: save Everyday Mystery, then load For you recommendations with two remaining cases and the completed case excluded.
- Hosted filters: Cold Case + Thriller with solo/free/under10 gives an honest zero-result state and preserves the URL after reload.
- The local runtime could not reach the external Railway origin (`ERR_EMPTY_RESPONSE`), so automated external-target attempts did not run successfully. The six automated scenarios passed against the compiled production build locally and in GitHub CI; the hosted checks above were performed through the cloud browser. Do not describe all six as automated tests of Railway.
- GitHub CI for the source commit passed: https://github.com/balogun2006/plotrush/actions/runs/42171728189 .
- Production dependency audit: no known vulnerabilities reported.
- Draft review: https://github.com/balogun2006/plotrush/pull/1 . Merged into main on 6 November 2026 by owner instruction.
- Preview screenshot is stored under docs/previews. No production readiness or backup/restore certification is claimed.

## Group tutorial increment

- PR #1 merged into main at `a0928624d2d301c7dfb40b221a2b6aa95a811a22`. Group work is isolated on `feat/group-tutorial`.
- Added free `/rooms` tutorial, 2–6 players, private clues, shared board, immutable private votes, consensus reveal, reconnect/presence/host transfer and server-time deadlines. Catalogue includes the free group tutorial and Wedding & Family filter. [ADR002](ADR-002-GROUP-PREVIEW.md) explains aggregate storage and polling deviations.
- 34 domain/SQL tests passed, including active-seat capacity races, unauthorised clue sharing, clue distribution for2–6, future-round protection on departure, stale commands, vote privacy/immutability/ties, timeout abstention and pause/expiry/reconnect.
- Eight Playwright scenarios passed against the compiled production build and PostgreSQL wire adapter: existing six solo/discovery checks plus desktop and Pixel7 four-browser group playthroughs. Group checks include separate identities, wrong-owner share denial, shared clue propagation, reload/reconnect, private voting and persisted 100/100 reveal. The group test uses independent synthetic forwarded addresses on the local harness to avoid exhausting a shared guest-creation rate bucket; application limits are unchanged.
- TypeScript, ESLint, production build and all five structural fixture checks passed. Earlier browser runs found stale-action UX and readiness-button issues, corrected before this successful run. The local browser was Chromium153 from the official npm registry package via TEST_CHROME_PATH; no browser package was added to application dependencies.
- Paystack placeholder values and false payment/direct-ad/Google-ad flags were set on Railway staging with deploys skipped. Replacing keys alone does not enable checkout; payment integration is still outstanding.
- This increment does not complete MN-003 or all MN-007–010 release criteria. Verified identity, commerce, editorial tools, realtime outbox, full idempotency/retention and operational drills remain open.

### Verified group staging release

- Deployed application source: `8267eee8b37be364a3ae6a33c369ec4aeb43b1c6` (all76 workspace files matched the uploaded tree before deployment). Local working tree was clean after adopting the browser-authored commits.
- Railway deployment `cf688c68-3daa-4011-84ac-c6a68f1f570d` reached SUCCESS. Logs confirm additive migration/import and application readiness. Existing database and solo progress were preserved.
- Hosted manual check at `/rooms`: create free lobby, ready up, refresh and recover the same seat/readiness, recover/copy original invitation from sessionStorage, observe start disabled with one player, then leave the disposable room. `/explore?mode=group&access=free` shows exactly one free group tutorial and correct duration/theme/action.
- Full four-browser playthroughs were automated locally against the production build, not the external Railway origin. Do not describe the hosted lobby smoke as a complete hosted multiplayer playthrough.
- GitHub PR workflow passed for the deployed source: https://github.com/balogun2006/plotrush/actions/runs/42274095729 . A separate push-triggered duplicate was still running at the first status check.
- Draft PR #2: https://github.com/balogun2006/plotrush/pull/2 . Merged into main at `a0c38498f8710fc28277fcd989732abfcb5ac98b` by owner instruction.
- Live preview: https://plotrush-web-staging.up.railway.app/rooms . Railway is pinned to the application source above, so later documentation/screenshot commits do not deploy.
- Screenshot: `docs/previews/plotrush-group-preview-1793991148820.jpg`.

## Account and commerce foundation increment

- PR #2 merged into main at `a0c38498f8710fc28277fcd989732abfcb5ac98b`. Work is isolated on `feat/accounts-commerce`.
- Added `/account`, email challenge/delivery adapter, expiry/attempt/replay protection, session rotation/logout, same-principal upgrade and explicit existing-account merge preserving notes/history/interests. Active cross-account group merges defer until finish/leave.
- Added private mode-specific draft products/prices, verified-owner server-priced idempotent orders, payment-attempt references and atomic duplicate-safe fulfilment. Development simulation is local-only; Railway checkout remains disabled and premium gameplay remains blocked.
- Added generated account/commerce OpenAPI from runtime Zod contracts and CI drift check. It does not yet cover gameplay/admin or Paystack webhooks.
- [ADR003](ADR-003-ACCOUNTS-COMMERCE.md) records configuration, migration, merge limitations and remaining MN-003/011/012 scope.
- 47 domain tests passed after the account/principal fencing change. Tests cover code expiry/replay/attempt bounds, failed delivery, ownership denial, explicit merge, duplicate active history preservation, active room deferral, deployment mock isolation, server price/idempotency, payment mismatch/late success/duplicate transaction and mode-specific ownership.
- Ten desktop/mobile Playwright scenarios passed against the compiled production build and PostgreSQL wire adapter. The new account scenario saves notes, verifies a labelled local test code, reloads, signs out/in, confirms an explicit merge and completes a development order. Spoofed success query does not grant ownership. Existing solo and four-browser group scenarios pass.
- TypeScript, ESLint, OpenAPI drift check, production build and five fixture checks passed. A mobile header overlap found by the browser tests was fixed and the full suite rerun. An overlapping local test run caused a trace-artifact error; only the subsequent isolated complete pass is counted.
- No live Resend/Paystack operation is claimed. Railway email flags remain false with a placeholder key and empty sender; an independent random auth secret was configured without exposing it. Premium products remain inactive and checkout mocks are denied on deployment.

### Verified account/order staging release

- Application source `c86238df45398e7c18510f7c80e3cfcc0ca69422` matched all90 uploaded project files before deployment. Local working tree was clean after adopting the browser-authored commits.
- Railway deployment `4f262ec4-2de6-4c3b-bb29-356de09486f6` reached SUCCESS. Logs confirm schema/import readiness and successful app startup.
- Hosted `/account` correctly displays email recovery unavailable with the current placeholders; `/shop` displays premium cases in preparation and exposes no mock checkout UI.
- A hosted free Last Slice investigation completed with100/100 after migration, survived refresh and appeared in My cases. Previously completed cases remained in the library. Live email verification or real checkout was not performed.
- GitHub CI passed for this source in both PR and push workflows: https://github.com/balogun2006/plotrush/actions/runs/42305054011 and https://github.com/balogun2006/plotrush/actions/runs/42304901899 .
- Draft PR #3: https://github.com/balogun2006/plotrush/pull/3 . PR #2 is merged; this increment remains on `feat/accounts-commerce` for review.
- Preview: https://plotrush-web-staging.up.railway.app/account . Screenshot `docs/previews/plotrush-account-preview-1794004358345.jpg`.
- Railway remains pinned to the source above; later evidence-only commits do not redeploy.
- Email activation still needs a real RESEND_API_KEY, EMAIL_FROM on a verified sending domain and FEATURE_EMAIL_AUTH=true. AUTH_CODE_SECRET is already generated on staging and should not be replaced with a placeholder. Actual delivery must be smoke-tested before acquisition. Paystack sandbox/webhook/reconciliation/receipts and paid gameplay remain next dependent work; payment placeholders are preserved and do not enable checkout.

## Paystack sandbox integration increment

- Branch `feat/paystack-integration` builds on the unmerged account/order foundation (PR #3). No previous PR was merged as part of this increment.
- Added hosted Paystack checkout with server-generated stable references, initialization leases, allowlisted checkout redirects, owner-only return/status checks and explicit sandbox products. Live checkout remains unavailable in this draft preview.
- Added bounded raw-byte webhook signature verification, timestamp/rotation support and opt-in legacy compatibility; durable deduplicated PostgreSQL inbox; bounded reconciliation worker with crash-recoverable leases; independent receipt outbox. Amount/currency/environment/reference and provider transaction uniqueness remain server enforced. Query parameters never grant ownership.
- Migration004 is additive and idempotent. Fulfilment locks order before attempt to preserve consistent lock ordering. Duplicate purchases receive a manual-review audit event; no automatic refunds are implemented.
- 59 domain/provider/SQL tests passed, including initialization races/uncertainty, large provider IDs, signature tampering/rotation/replay, inbox deduplication, pending retries, permanent mismatches, abandoned leases, late success, negative owner access and independent receipt retry.
- TypeScript, ESLint, generated OpenAPI drift check, production build and five structural fixture checks passed. A stale local Turbopack cache initially failed to open; rebuilding with a fresh generated cache succeeded without source changes.
- Browser tests exercise the real compiled webhook route with synthetic signatures and ignored events, alongside existing solo, account and four-browser group journeys. Provider HTTP calls in domain tests are controlled transports; no actual Paystack or Resend operation is claimed.
- [ADR004](ADR-004-PAYSTACK.md) records architecture and remaining scope. [Railway variable runbook](RAILWAY-VARIABLES.md) lists owner values, activation switches, endpoint configuration, worker references and smoke/recovery steps.
- Real API/signing keys and a verified email sender are still required before external sandbox acceptance checks. Premium gameplay, refunds, editorial approval, ad integrations and production operational certification remain open; this does not complete all MN-012 release criteria.

- Final isolated Playwright run: all12 desktop/mobile scenarios passed against the compiled production build and PostgreSQL wire adapter. Earlier runs found missing test-session/version setup and shared guest-rate-bucket exhaustion; the fixture now uses a separate synthetic address, preserving application limits. No automated external-origin acceptance test is claimed.

### Verified Paystack increment staging release

- Application source `88e53c44afc8058832c325cfef347b455514e185` matched all103 tested project files before deployment. Both services are pinned to this source; later documentation/evidence commits do not deploy.
- Web deployment `fdd7748a-7729-4f37-b3f3-8b5c4d70915c` reached SUCCESS. Runtime logs confirmed the additive schema/import migration before application readiness, and hosted `/api/health` returned `{"status":"ok","mode":"draft-preview"}`.
- Worker service `plotrush-payments-worker` (`12435406-974e-416f-904a-39e0f6aa299d`) deployment `5bf6c821-3752-476a-aa64-bb1d45c6bf88` reached SUCCESS. Its read-back configuration is a private five-minute UTC cron, restart NEVER, no public domain/healthcheck, `pnpm payments:work` and references to the existing web credentials. No real provider operation has been performed.
- Hosted `/shop` shows premium cases in preparation and exposes no mock checkout. New Paystack switches remain false; existing key names and auth secret were preserved.
- Hosted manual regression: free Playlist Switch started without email/payment/invitation/ad, evidence opened, private notes survived reload, and a correct verdict produced100/100. The saved result appeared in My cases alongside two earlier completed Last Slice attempts after migration. This hosted smoke is distinct from the12 automated local browser scenarios.
- GitHub CI passed for both PR and push on the deployed source: https://github.com/balogun2006/plotrush/actions/runs/42389045837 and https://github.com/balogun2006/plotrush/actions/runs/42388968742 .
- Draft PR #4: https://github.com/balogun2006/plotrush/pull/4 . It is based on `feat/accounts-commerce` (PR #3) for a focused integration diff; merge #3 first and retarget #4 to main when requested. Neither PR was merged in this increment.
- Screenshot: `docs/previews/plotrush-paystack-staging-1794067437062.jpg`. Staging preview: https://plotrush-web-staging.up.railway.app/library .
- Railway environment status confirmed the worker's first scheduled execution **succeeded** at `2026-11-07T16:05:08.529Z`, with zero running/crashed worker replicas afterward. Web and Postgres were online; no issues, failures or pending work were reported. This confirms cron startup/exit with current configuration, not a real Paystack transaction or delivered receipt.

## Editorial studio increment

- Branch `feat/editorial-admin` builds on the unmerged Paystack increment (PR #4). No previous PR was merged during this increment.
- Added `/admin`, protected editorial membership, operator-only provisioning, encrypted authenticator enrollment, replay/rate protection and ten-minute browser-bound staff sessions. Author/last-editor self-approval is denied, including for an admin.
- Added text-case JSON draft authoring/import, structural validation, revision fencing, independent review checklist/evidence, explicit publication confirmation, immutable versions, withdrawal without fixture fallback, UTC editorial calendar and seven-day queue-gap indicators. Existing solo/group versions remain pinned.
- New private drafts no longer enter catalogue/starts merely by being the newest version. Only explicit releases or registered public preview fixtures are eligible. Canonical content is protected against mutation/deletion by a database trigger.
- Migration005 is additive and repeatable. Synthetic verified staff accounts exist only in the disposable loopback E2E harness; no real staff accounts or approvals are fabricated on staging.
- 68 domain/provider/SQL tests passed, including nine new editorial/staff tests. TypeScript, ESLint, generated OpenAPI drift, production build and all five structural fixture checks passed.
- All14 desktop/mobile Playwright scenarios passed against the compiled production build and PostgreSQL wire adapter. Two independent synthetic staff accounts complete enrollment/MFA, draft/review/publish/schedule/withdraw; private API access is denied to players, catalogue excludes solutions and existing gameplay survives withdrawal. Existing account, Paystack route, solo and four-browser group checks also pass.
- Initial browser checks found the test HTTP client did not send Secure cookies over loopback HTTP even though browser fetch did; authenticated checks now use the actual signed-in browser. A calendar-gap correlation bug was caught and fixed by the SQL tests. A stale generated local Turbopack cache was replaced before a successful build. Only the final complete passes above are counted.
- [ADR005](ADR-005-EDITORIAL.md) records architecture, rollback boundaries and remaining scope; [staff setup](STAFF-SETUP.md) records provisioning, MFA, activation and recovery. `FEATURE_EDITORIAL_PUBLISH=false` was added on Railway without changing existing keys/flags. Actual staff email delivery/enrollment and human case approval still need owner configuration and review.
- Screenshot `docs/previews/plotrush-editorial-studio.jpg` shows the **local synthetic acceptance studio**, not authenticated staff on Railway. No actual case or independent blind test is claimed approved.
- MN-014 remains partial: rich-media authoring, full taxonomy administration, external evidence attachments, notifications and production operational checks remain open. Daily calendar slots are implemented, but public daily selection/streaks and premium gameplay are still separate work.

### Verified editorial staging release

- Application source `4038503323f4a64dd354850dc9bf05109e5f3f67` matched all118 uploaded/tested files before deployment. Web service is pinned to this source; later evidence-only commits do not deploy. The working tree was clean after adopting the browser-authored source commits.
- Railway web deployment `9bdb987b-0632-478b-9c2f-95cfcbaa4649` reached SUCCESS. Logs confirm the schema/import pre-deploy command and successful Next startup. Hosted health returned `{"status":"ok","mode":"draft-preview"}`.
- Hosted `/admin` displays the protected studio sign-in screen. A non-staff browser's direct `/api/v1/admin/templates` request returned the STAFF_DENIED error envelope with no private canon. No actual staff membership was granted and no real case was approved/published. Public publishing stays disabled.
- Hosted free catalogue retained exactly three solo draft cases. Three previously completed investigations remained in My cases. A new free Wrong Parcel investigation started without email/payment/ad/invitation, saved notes, reloaded and recovered the same notes. Full editorial and group playthroughs remain automated local/CI evidence, not hosted staff acceptance claims.
- Railway environment status reported web/Postgres online, no failures/issues/pending changes, and a successful payment-worker cron after migration (`2026-11-08T23:40:16.503Z`). The worker remains on its previously tested payment source; no provider test charge or email delivery was performed.
- Both GitHub workflows passed for the deployed source: https://github.com/balogun2006/plotrush/actions/runs/42535944921 and https://github.com/balogun2006/plotrush/actions/runs/42535858811 .
- Draft PR #5: https://github.com/balogun2006/plotrush/pull/5 . Based on `feat/paystack-integration` for a focused diff; prior pending PRs #3/#4 were not merged. Follow their dependency order when merging and retarget this PR afterward.
- Live studio entry: https://plotrush-web-staging.up.railway.app/admin . Hosted gate screenshot: `docs/previews/plotrush-editorial-staging-1794181272542.jpg`. The separate `plotrush-editorial-studio.jpg` shows the local synthetic authenticated workspace.
- To use the studio, configure actual email delivery, verify staff accounts, provision the intended editor/publisher through the authorised operator command, then enroll their authenticators. [Staff setup](STAFF-SETUP.md) covers this process. No new provider key is needed for the editorial increment; FEATURE_EDITORIAL_PUBLISH is the new independently disabled switch.

## Premium gameplay preview

- Verified buyers can start a purchased solo case or host a purchased group case from their order or My Cases. Purchases grant reusable access for their specific mode. The server requires the matching paid order, active entitlement, payment environment and eligible case release.
- Guests join by invitation with no purchase or email account. The premium fixture needs four ready players and supports up to six. The server rechecks the original buyer’s access when starting the lobby. Suspension or withdrawal stops future starts while existing investigations remain available.
- The staging switch is `FEATURE_PREMIUM_PLAY=false`. The sandbox catalogue switch permits the labelled public test fixture. New hosted checkout requires premium play to be enabled so buyers have a playable destination. Payment verification and reconciliation can still complete after checkout is disabled.
- No schema migration is required. The test suite covers all three solo rounds, group capacity, invitation access, ownership isolation, mode and environment mismatches, and a revoked purchase after lobby creation. Actual provider acceptance, reviewed release content, live billing and refunds remain separate milestones.

## Daily mystery and streaks

- The homepage reads the UTC editorial calendar using database time. A slot serves its scheduled immutable version while the case release is enabled. Missing or withdrawn slots offer a labelled free archive pick. No fixture was published or scheduled for this increment.
- A guest can start, resume or view a completed daily result without an account. A dated start is unique per player and UTC day. A stale card refreshes when its day or scheduled version changes. In-progress daily cases keep their original date and can be resumed after midnight.
- Streaks count consecutive UTC dates with completed daily attempts, regardless of score. The previous streak remains visible during the current day while a result is pending. Archive play and replays add no credit. A repeated case can earn credit only for its earliest completed daily slot. Account merges preserve both results and retain one daily credit per date, preferring a completed result.
- Migration006 adds the nullable date and partial uniqueness index to existing attempts. Old investigations and scores remain available. The daily API uses the existing private no-store response and anonymous session flow.
- The seven-day expiry and explicit abandon controls described in the broader solo specification remain outstanding. Public launch still requires the reviewed content queue and independent blind playtests.
- TypeScript, lint, generated OpenAPI, five fixture validations and the production build passed. All 74 domain and SQL tests and all 14 desktop and mobile browser scenarios passed. The browser flow schedules a synthetic case, completes it as a guest, verifies streak credit and confirms archive fallback for a different player after withdrawal.

## Refund requests and finance reconciliation

- Paid Paystack test-order owners can open one refund request per order. The order page distinguishes a request from the amount Paystack has confirmed as refunded.
- Finance and admin staff can use the MFA-protected finance desk to find orders, read open requests, reconcile a Paystack refund ID and close a request with an audit reason. Finance-only staff have no editorial canon access.
- Reconciliation uses a read-only Paystack lookup and matches the refund ID, payment transaction, currency and test environment. An order lock serializes concurrent updates and a unique provider ID prevents counting a processed refund twice. Confirmed partial refunds preserve access. Confirmed refunds totaling the original payment revoke the entitlement for that order. History and in-progress investigations remain available, and a later verified purchase can grant access again.
- Migration007 adds private request and refund tables and the finance role. The existing staff enrollment and Paystack test key are sufficient. An authorised operator can grant the finance role using the existing staff command.
- Staff initiate refunds separately in the Paystack dashboard. Automatic provider refund initiation, dispute reconciliation, revenue exports and provider-backed staging acceptance remain outstanding in MN-013.
- All 77 automated tests and 14 existing desktop and mobile browser scenarios passed. TypeScript, lint, generated OpenAPI, fixture validation and the production build passed. Refund-specific tests use a disposable database and synthetic provider responses.

## Paystack dispute reconciliation

- Finance and admin staff with fresh MFA can sync a dispute ID from Paystack against a paid test order. The lookup matches the dispute ID, transaction ID, payment reference, amount, currency and environment. Only the dispute summary is retained, with no customer or card payload.
- A verified dispute places the original purchase on hold. A resolved decline with no refund clears that dispute's hold. All holds must clear before new premium starts can resume. Accepted or unclear outcomes remain on hold for finance review. A disputed refund amount is shown separately from confirmed refund totals.
- Existing investigations and completed results remain accessible. Dispute reconciliation does not modify refund revocations or other entitlement states. Older provider records cannot overwrite newer ones, and duplicate syncs do not add repeated audit events.
- Migration008 adds the private dispute table and a separate entitlement hold. Sync is staff-triggered. Paystack dispute webhooks, provider-side decisions and real provider acceptance testing remain outside this increment.
- Verification passed locally with 79 automated tests, 14 existing browser scenarios, TypeScript, lint, OpenAPI, fixture validation and the production build. New tests use simulated provider responses, including duplicate and stale status updates, payment mismatches and refund interactions. [Paystack Dispute API](https://paystack.com/docs/api/dispute/).

## Returning account sign-in

- A verified account can sign in from a new browser while its existing group room remains active. The account merge checks only rooms whose guest memberships would move. It still defers changes to affected active rooms.
- A database regression test reproduces the blocked sign-in and checks that the existing account retains its seat and room version. All 80 automated tests, TypeScript, lint, API contracts, fixture validation and the production build passed locally.

## Sandbox refund recovery

- The private payment worker checks up to five due open refund requests per run and lists Paystack refunds by the original transaction ID and currency. It retries after five minutes and reconciles only processed, matching test refunds. The provider lookup is read-only and does not initiate a refund.
- The worker and finance desk use the same order lock, provider ID deduplication and refund total checks. Partial refunds preserve access. A full refund revokes future starts, retains existing investigations and closes the open request. The worker records a distinct audit action and logs only aggregate results.
- Apply migration009 with the web service before deploying the worker. No new Railway variables or Paystack webhooks are needed. Closed requests and dashboard refunds without an open request still require staff reconciliation. Provider results beyond the worker's bounded page scan also require manual review.
- Railway staging verified automatic reconciliation of a processed full sandbox refund. The order showed the confirmed amount, the new-start option disappeared, and the original investigation remained accessible.

## Sandbox revenue CSV

- Finance and admin staff with fresh MFA can download up to 31 inclusive UTC days from the finance desk. The CSV groups verified Paystack test activity by currency and solo or group mode. It uses the order payment date for sales and the PlotRush reconciliation date for confirmed refunds, so a refund for an earlier sale appears in the current reporting period.
- The file contains gross sales, confirmed refunds and net before fees in integer minor units. It contains no buyer details or order references. Exports are audited and served as private, uncached attachments. The report does not include fees, settlements, chargebacks or advertising revenue.
