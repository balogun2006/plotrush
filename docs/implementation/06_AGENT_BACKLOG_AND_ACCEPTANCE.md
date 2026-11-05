# 06 — Ordered implementation backlog

Each ticket requires code, meaningful verification, documentation of deviations and a demonstrable result. Sequence is dependency-driven. Estimated sizes S/M/L are relative, not deadlines. Fix failed exit gates before claiming the release complete.

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| MN-001 | Inspect repository/instructions; scaffold stack, lockfile, env and CI | none | App builds; dev/test commands documented; no secrets committed |
| MN-002 | Design tokens and accessible mobile components | 001 | Catalogue, cards, modal, inputs, navigation and loading/error states match approved mockup |
| MN-003 | DB migrations, private content schema, RLS and anonymous Auth | 001 | Cross-user negative access tests pass; anonymous→verified account upgrade preserved |
| MN-004 | Content schema, fixture validator/importer and safe catalogue projection | 003 | Five supplied seeds import as drafts; invalid references rejected; answers absent from public payload |
| MN-005 | Solo engine and daily selection | 002–004 | Anonymous user completes/resumes; immutable result; UTC streak/replay rules covered |
| MN-006 | Private hints, notes and result explanation/share card | 005 | No ad needed to finish; optional hints; spoiler-free exports and accessible transcripts |
| MN-007 | Room lobby, transactional join/start and invite sharing | 003–004 | Capacity race safe; nickname≠identity; free and paid gates distinct |
| MN-008 | Private evidence, group board, rounds and realtime invalidations | 007 | Four independent browsers see correct clues; sharing only unlocks authorised clue |
| MN-009 | Presence/reconnect, host transfer, deadlines and expired room recovery | 008 | Disconnect promotes only unlocked clues; no stalled deadline if cron absent |
| MN-010 | Private voting and deterministic joint reveal | 008–009 | Duplicate/late votes safe; tie/abstention correct; one result transaction |
| MN-011 | Verified accounts, product prices, orders and mock provider | 003,005,007 | Mode-specific ownership; integer minor units; no client amount authority |
| MN-012 | Paystack sandbox adapter, signed webhook inbox and reconciliation | 011 | Tamper/duplicate/race/mismatch/late-success tests pass; receipt retries independent |
| MN-013 | Refunds, dispute workflow and finance UI | 012 | Confirmed full refund revokes future access; audit and totals correct |
| MN-014 | Editorial admin, approval/publish, immutable versions and calendar | 004 | Running games retain versions; publish role enforced; queue alerts |
| MN-015 | Advertiser enquiry and staff advertiser/campaign/creative tools | 002–003 | Safe uploads, review states, contract/payment distinction, staff audit |
| MN-016 | Direct ad selection, caps, exclusivity and event pipeline | 015 | Paid session excluded; concurrent cap reservations safe; no unapproved ad |
| MN-017 | Campaign payment activation, reporting and make-good workflow | 012,016 | Cleared finance prerequisite; reports deduplicate and label trust limits |
| MN-018 | Consent, Google interface and development-only mocks | 006,016 | Consent refusal/no-fill works; no real tags in development or unapproved production |
| MN-019 | Approved H5 adapter and bounded rewarded hint intents | 018 + external approval | `adViewed` only reward trigger; forged callback cannot grant premium/cash; paid games ad-free |
| MN-020 | Analytics cohorts, attribution and financial/retention dashboards | 005,010,012,017 | Server/client events separated; no PII/raw clues; currency and cohort separated |
| MN-021 | Security, accessibility, performance and end-to-end release tests | all enabled modules, including025–031 | Evidence against launch-gate matrix; no skipped critical security/money checks |
| MN-022 | Staging deploy, scheduler, backup/restore and incident drills | 021 | Repeatable deploy, actual four-player staging game, restore rehearsal |
| MN-023 | Complete editorial pipeline and launch catalogue | 014,029 | ≥14 reviewed daily cases + free group tutorial +2 premium; 3 well-stocked promoted themes per chapter07; independent blind tests recorded |
| MN-024 | Controlled alpha/beta launch, provider enablement and owner handover | 022,023 for broad beta | Real provider status disclosed, monitoring/kill switches live, release manifest complete |

| MN-025 | Taxonomy, discovery metadata, schema/import and reviewed backfill | 003,004 | Stable tags/FKs, snapshot rules, valid1.1 seeds and safe catalogue projection |
| MN-026 | Theme cards, category routes, catalogue filters/facets and URL state | 002,025 | Correct OR/AND/duration/dedup/counts, mode preserved, empty/retired/unknown states |
| MN-027 | Optional interests onboarding, save/edit/clear and account merge | 003,025 | No email gate; owner-only preferences; skip/conflicts/deletion handled |
| MN-028 | Deterministic recommendations and editorial fallback | 005,010,025,027 | Unplayed eligible ranking/reasons, repeat exclusion, no shared personal cache |
| MN-029 | Taxonomy editorial tools, versioned tagging and shelf readiness | 014,025 | Reviewed tags, accurate supply, immutable gameplay and category audit |
| MN-030 | Contextual campaign theme targeting and discovery analytics | 016,020,026 | No stored-interest ad targeting; cohorts and nonadditive tag counts correct |
| MN-031 | Discovery QA, backward-compatible migration and release checks | 026–030 | Negative-access tests, URL/mobile checks, migration/revert and launch gates pass |

Google approval blocks MN-019 live activation, not implementation of its interface/tests or earlier free/direct-ad releases. An owner-provided deployment environment can change the hosting adapter without changing business invariants. Do not wait for sponsorship deals to implement and validate direct ad infrastructure.

## Required browser acceptance scenarios

1. New visitor starts free solo without email, completes correctly, refreshes and sees same result. Wrong answer still receives a complete explanation.
2. Visitor declines ads/consent and still completes daily case. No ad fill leaves UI responsive and optional free hint fallback works.
3. Same anonymous identity verifies email and retains notes/result; a different identity cannot access them.
4. Buyer returns from hosted checkout with spoofed success query; no entitlement granted. Valid signed sandbox event plus verification grants exactly once.
5. Verified host creates paid room; five guests can join without paying, seventh person cannot occupy a seat. Four ready users can start; three cannot start a new premium room.
6. Different members inspect each other's network payloads: unshared clues/votes are absent. Sharing one clue reveals only that clue.
7. Host loses connection; a guest becomes acting host; departed seat clues become available on schedule. Reconnect preserves member identity.
8. Everyone votes concurrently; room reveals once. Ties display no consensus; late votes cannot alter result.
9. Direct campaign is approved but unpaid: no delivery. Paid but unapproved creative: no delivery. Approved+cleared+in schedule: eligible free placement appears.
10. Approved campaign reaches cap in concurrent sessions: no excess accepted billable impressions. Staff previews/hidden tab/duplicate event excluded.
11. Any paid purchased-case session shows no Google or direct ads. Free catalogue may show disclosed promotions consistent with copy.
12. Publisher fixes a case via new version; already active solo/group sessions remain consistent with old version.

## Agent output after each milestone

Summarise behaviour delivered, repository SHA, evidence/test results, remaining blockers and next dependent ticket. Keep a checked `docs/implementation-status.md` mapping all tickets; a UI-only checked item must not imply database/provider integration. Retain failing-case evidence and identify what was actually retested.

## Later roadmap (requires new validation)

R3+: distinct premium bundles; account-wide ad-free membership with renewal/cancellation; advertiser self-service upload/payment/review; tracked conversion integrations with consent; async groups; human-curated branded cases; PWA offline reading; native apps/AdMob; creator revenue share. No need to build these during beta. Do not implement an ad auction or subscription simply because interfaces could support them.

## New browser acceptance scenarios (v1.1)

13. Select Cold Case + Thriller, solo, Free and Under 10; results meet OR-within/AND-across semantics and never silently substitute paid/group cases. Share URL, refresh and use Back: selection preserved.
14. A multi-theme case appears once; counts/facets reflect current eligible inventory and mode-specific durations at9/10/19/20/30/31 minutes.
15. Skip optional interests and still play. Save anonymously, upgrade verified account and retain choices; clear interests without losing purchases; another user/ad manager cannot read them.
16. For you ranks using published deterministic rules; no-preference/opt-out shows Featured; completed cases are not passed off as new. Explicit filters remain authoritative.
17. Empty or retired theme has honest alternatives; no unplayable zero-case public chip. Editor updates tags via revision; existing room and solo answer stay frozen.
18. Theme-targeted direct ad is contextual, labelled and eligible only in permitted free placement; saved interests never become an ad target.

MN-025–029 belong in private alpha. MN-030/031 and updated MN-021/022/023 must pass before revenue-ready beta. Do not interpret ticket numbering as postponing theme features until after launch.
