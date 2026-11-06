# Implementation status

Updated 6 November 2026. First playable **draft preview**; no alpha/beta or production launch is claimed.

## Delivered slice

Guest solo play, database-backed notes/hints/results, discovery filters, private interests, recommendations and case library. Only three free solo drafts are playable; group/premium are denied. Payments, ads and staff tools have no active integration. Public fixture solutions remain examples.

## Verification

- Production build, TypeScript and ESLint checks pass locally (final rerun recorded below when complete).
- 22 SQL/domain tests passed: ownership denial, opaque sessions, stale writes, immutable concurrent accusation results, hints, notes, interest isolation, rate counters and discovery boundaries.
- Six Playwright scenarios passed against the compiled production app, PostgreSQL wire adapter and disposable PGlite server: desktop/mobile completion and refresh, filter URL/empty states, cross-browser denial and Origin rejection.
- Browser download was unavailable; the local run used a registry-packaged Chromium 153 executable via TEST_CHROME_PATH. Standard CI installs Playwright Chromium. The tests passed after fixing pre-hydration clicks and accessible radio labels; the initial failures are not counted as passes.
- Supplied Python fixture validator passed for all five drafts; this is structural validation, not independent content playtesting.

## Ticket map

| Ticket | State               | Evidence / remaining work                                                                                                                                        |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MN-001 | Implemented locally | Scaffold, pinned dependencies, lockfile, scripts and CI definition. Remote CI run pending upload.                                                                |
| MN-002 | Partial             | Purple/ivory/lime responsive home, catalogue, game, interests, library and loading/error states. Modal/filter-sheet and full accessibility audit pending.        |
| MN-003 | Partial             | Opaque guest sessions, private schema, owner checks and negative-access tests. Email upgrades, merges, MFA, role separation and runtime least privilege pending. |
| MN-004 | Partial             | Five checksum-addressed draft imports, Zod validation, safe metadata projection. Publication/editorial workflow pending.                                         |
| MN-005 | Partial             | Three free solo drafts, resumable attempts, version checks, atomic immutable results. Daily editorial releases, streaks, seven-day expiry and ranking pending.   |
| MN-006 | Partial             | Private saved notes, free hints, explanation and spoiler-free text share. Autosave, rendered share cards and broader accessible export pending.                  |
| MN-007 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-008 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-009 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
| MN-010 | Not started         | Follow acceptance criteria in chapter06; not included in the initial solo preview.                                                                               |
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
| MN-022 | Partial             | Isolated Railway staging PostgreSQL provisioned; application deploy and smoke checks in progress. Backup/restore and multiplayer drills pending.                 |
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
- Web service `bef0eb3f-0e3c-40bd-8d5b-c6b2c7c27746` configured with private DB reference, PREVIEW_MODE, fixed origin and port. Application source connection and deployment evidence pending.
- Reserved application origin: `https://plotrush-web-staging.up.railway.app` (not yet claimed as a healthy deployment).

## Repository and next work

Work is on `feat/railway-playable-alpha`. GitHub connector writes return 403 and shell git push lacks credentials; source is being committed through the owner-authenticated GitHub web UI. Final commit SHA and exact local/remote file verification will be recorded after upload.

Continue with complete MN-003 account/role foundations and MN-007–010 durable group flows, then verified accounts/commerce, editorial tools, direct ads and Google adapters at their dependency points. Keep discovery core work alongside these tickets. See ADR-001-RAILWAY.md for all preview deviations.
