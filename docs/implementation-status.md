# Implementation status

Updated 6 November 2026. First playable **draft preview**; no alpha/beta or production launch is claimed.

## Delivered slice

Guest solo play, database-backed notes/hints/results, discovery filters, private interests, recommendations and case library. Three free solo drafts and the free 2–6 player group tutorial are implemented. Premium cases remain denied. Payments, ads and staff tools have no active integration. Public fixture solutions remain examples.

## Verification

- Production build, TypeScript and ESLint checks passed locally after the database recovery change.
- 22 SQL/domain tests passed: ownership denial, opaque sessions, stale writes, immutable concurrent accusation results, hints, notes, interest isolation, rate counters and discovery boundaries.
- Six Playwright scenarios passed against the compiled production app, PostgreSQL wire adapter and disposable PGlite server: desktop/mobile completion and refresh, filter URL/empty states, cross-browser denial and Origin rejection.
- Browser download was unavailable; the local run used a registry-packaged Chromium 153 executable via TEST_CHROME_PATH. Standard CI installs Playwright Chromium. The tests passed after fixing pre-hydration clicks and accessible radio labels; the initial failures are not counted as passes.
- Supplied Python fixture validator passed for all five drafts; this is structural validation, not independent content playtesting.

## Ticket map

| Ticket | State               | Evidence / remaining work                                                                                                                                        |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MN-001 | Implemented locally | Scaffold, pinned dependencies, lockfile, scripts and CI definition. GitHub CI passed for deployed commit eb8493918ebac50628c5ea1c28aab045a2e42196.               |
| MN-002 | Partial             | Purple/ivory/lime responsive home, catalogue, game, interests, library and loading/error states. Modal/filter-sheet and full accessibility audit pending.        |
| MN-003 | Partial             | Opaque guest sessions, private schema, owner checks and negative-access tests. Email upgrades, merges, MFA, role separation and runtime least privilege pending. |
| MN-004 | Partial             | Five checksum-addressed draft imports, Zod validation, safe metadata projection. Publication/editorial workflow pending.                                         |
| MN-005 | Partial             | Three free solo drafts, resumable attempts, version checks, atomic immutable results. Daily editorial releases, streaks, seven-day expiry and ranking pending.   |
| MN-006 | Partial             | Private saved notes, free hints, explanation and spoiler-free text share. Autosave, rendered share cards and broader accessible export pending.                  |
| MN-007 | Partial             | Free tutorial lobby, invite and atomic capacity/start checks. Paid entitlement and general request idempotency pending.                                          |
| MN-008 | Partial             | Private round assignments, authorised sharing and board. Polling replaces realtime; outbox and room notes pending.                                               |
| MN-009 | Partial             | Heartbeats, host transfer, deadline catch-up, pause/expiry and evidence promotion. Verified recovery and paid rehost pending.                                    |
| MN-010 | Partial             | Private immutable votes, tie/abstention rules and persisted joint reveal for the free tutorial. Paid/full release QA pending.                                    |
| MN-011 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-012 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-013 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-014 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-015 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-016 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-017 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-018 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-019 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-020 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-021 | Partial             | Local checks and desktop/mobile E2E for enabled solo scope; no full security/performance/accessibility/load certification.                                       |
| MN-022 | Partial             | Railway staging application and PostgreSQL deployed; live browser solo smoke passed. Backup/restore and multiplayer drills pending.                              |
| MN-023 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-024 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-025 | Partial             | Taxonomy constants, draft metadata validation and safe projection. Relational taxonomy/versioned editorial backfill pending.                                     |
| MN-026 | Partial             | OR/AND filters, mode durations, counts, URL state and honest empty results. Multi-select filter UI, themes routes, retired slugs and pagination pending.         |
| MN-027 | Partial             | Optional private guest interests with save/clear/revision conflicts. Verified-account merge and deletion flow pending.                                           |
| MN-028 | Partial             | Saved-theme overlap ranking with stable fallback and completed-case exclusion. Full chapter07 weighted scoring and editorial fallback pending.                   |
| MN-029 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-030 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-031 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |

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
- Draft PR #2: https://github.com/balogun2006/plotrush/pull/2 . Main contains the prior solo preview; this new group increment remains on the feature branch for review.
- Live preview: https://plotrush-web-staging.up.railway.app/rooms . Railway is pinned to the application source above, so later documentation/screenshot commits do not deploy.
- Screenshot: `docs/previews/plotrush-group-preview-1793991148820.jpg`.
