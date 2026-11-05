# 02 — Engineering specification

## 1. Architecture and repository

Recommended stack: TypeScript, Next.js App Router/React, Tailwind plus accessible headless components, Zod boundary validation, Supabase Postgres/Auth/Storage/Realtime, Vercel Node runtime, Vitest, Playwright and SQL integration tests. Use Node 24 LTS as a conservative supported baseline and pin a current compatible Next.js stable patch at implementation time; commit the package-manager version and lockfile. Do not copy an unverified old package version from this document. Supabase CLI migrations are the schema authority; generated database types are committed. Use SQL transactions/RPC for operations that must be atomic rather than a sequence of independent HTTP database writes.

```text
app/                       public, gameplay, account and admin routes
app/api/v1/                validated HTTP handlers
components/                accessible visual components
features/catalogue/
features/solo/
features/rooms/
features/commerce/
features/advertising/
features/editorial/
lib/auth/                  verified identity and permissions
lib/server/                server-only clients, transaction wrappers
lib/providers/             payments, ads, email, storage adapters
lib/observability/         structured logs and metrics
supabase/migrations/       SQL, functions, constraints, RLS
content/drafts/            no public build imports
scripts/                   validate, import, schedule, smoke
tests/unit/, integration/, e2e/, load/
docs/                      ADRs, generated OpenAPI, deployment/runbooks
```

Browser → authenticated Next.js API → database domain functions. Realtime sends invalidation signals only; clients refetch their permitted state. Do not host persistent WebSocket connections inside serverless request handlers. Supabase Realtime provides the connection service. At this scale avoid a separate microservice, queue cluster or Kubernetes deployment.

Public catalogue can be cached by canonical filters, market and catalogue revision; personalised interests/recommendations/ownership overlays cannot use shared caches. User state, evidence, orders, admin responses and result explanations are dynamic with `Cache-Control: private, no-store`. Never cache anonymous users' personalised pages in shared rendering. CSP and asset handling must distinguish approved ad scripts from application code; no arbitrary advertiser JS.

## 2. Identity, roles and access

Create an anonymous Supabase identity on first gameplay action. A UUID/nickname does not grant access by itself. Verify the session server-side using the supported Auth API/JWT verification; never trust a browser-supplied actor ID. Use the maintained SSR cookie integration, secure cookie settings, CSRF protections for cookie-authenticated mutations and Origin checks. Avoid storing service keys or sensitive recovery tokens in browser code.

Upgrade to verified email without losing the anonymous principal. If the email already belongs to another account, require fresh authentication to the destination account, then explicitly merge owned progress and memberships in a server transaction. Never merge based on an unverified email string. Resolve duplicate case ownership without duplicating entitlements; keep both receipts. Email identity merge requires dedicated tests and an audit entry.

Application roles: player, content_editor, content_publisher, ad_manager, finance, support, admin. Admin permissions come from protected membership records, never user-editable profile metadata. Admin requires MFA; sensitive operations require fresh session checks. Editor sees solutions; ordinary hosts and support staff do not by default. Finance changes payment records through reconciliation actions, not arbitrary status editing. Support can inspect public room status, remove an abusive nickname and issue audited access restoration after verification. No unrestricted impersonation endpoint.

Postgres: `public` holds only necessary read models; `app_private` holds canonical case JSON/solutions, financial processing and campaign contracts. Revoke anon/authenticated access to private schema and service-only functions. Enable RLS on every browser-exposed table and private Storage bucket. Reads use request-scoped user tokens/RLS wherever feasible; service-role writes must go through small central domain functions with actor checks. Service role bypasses RLS, so application tests must exercise it too. Security-definer functions use a fixed safe search_path, explicit schema names, least grants and no dynamic SQL. Do not expose unrestricted function execution through PostgREST.

Realtime: disable public channel access in production; private channel `room:<uuid>` requires active room membership. Broadcast only `{roomId, stateVersion, eventType}`; never clue bodies, votes, order info, host email or solution. Deny user-produced authoritative state broadcasts. Removed members lose API access immediately; invalidate/recheck channel membership and ensure previously connected sessions cannot receive protected content. An update signal containing no secrets may race with removal, but content refetch must deny access.

## 3. Data model

All IDs UUID unless a provider external identifier. All timestamps timestamptz/UTC. Money bigint minor units plus ISO currency. Include created_at/updated_at where meaningful; immutable financial/event/content records append rather than overwrite. The following specifies migration requirements, not runnable DDL.

| Table | Principal fields | Constraints and indexes |
|---|---|---|
| profiles | user_id FK auth, nickname, locale, created_at | PK user_id; no public email |
| staff_roles | user_id, role, granted_by, revoked_at | unique active role; server-only mutation |
| cases | id, slug, title, synopsis, art_path, modes, visibility | unique slug; public metadata only; approved discovery projection per chapter07 |
| case_versions | id, case_id, version, status, private_content_json, checksum, published_at | unique(case_id,version); private; immutable after publish |
| daily_releases | release_date, case_version_id, status | unique release_date; approved mini-case only |
| products | id, case_id, mode, active | unique stable product key; no client-editable prices |
| price_versions | id, product_id, currency, amount_minor, active_from/to | nonnegative; prevent overlapping active intervals per product/currency |
| solo_attempts | id, user_id, case_version_id, release_date nullable, state, round, state_version, started_at, completed_at, first_attempt, result_json | index(user_id,created_at); partial unique(user_id,release_date) for first daily attempt; partial unique(user_id,case_id) first non-daily result via case_id snapshot |
| attempt_clue_access | attempt_id, clue_id, unlocked_at, opened_at | PK(attempt_id,clue_id); no solution columns |
| player_notes | owner_id, attempt_id or room_id, body | exactly one parent; owner only; length≤2000 |
| hint_grants | principal_id, context_id, hint_id, source, grant_key, granted_at | unique grant_key; no transferable value |
| rooms | id, host_id, case_version_id, invite_code_hash, state, round, state_version, deadline_at, expires_at, active_host_id | index expires_at; transaction serialisation via row lock |
| room_members | id, room_id, user_id, nickname_snapshot, seat_index, ready, status, joined_at, last_seen_at, departed_at | unique(room_id,user_id); active unique(room_id,seat_index) |
| room_clue_assignments | room_id, clue_id, member_id, round, promoted_at | unique(room_id,clue_id); private mapping |
| room_shared_clues | room_id, clue_id, shared_by nullable, reason, shared_at | unique(room_id,clue_id) |
| room_votes | room_id, member_id, suspect_id, reason_id, submitted_at | unique(room_id,member_id); votes immutable; private until reveal |
| room_results | room_id, result_json, revealed_at | PK room_id; created once |
| domain_events | id, aggregate_type/id, version, event_type, safe_payload | unique(aggregate_type,id,version); no secret payload broadcast |
| orders | id, buyer_id, source, product_id/campaign_id, quoted_price_id, amount_minor, currency, status, expires_at | source=player/campaign; exclusive product/campaign link; indexes buyer,status |
| payment_attempts | id, order_id, provider, reference, provider_transaction_id, status, amount_minor, currency | unique(provider,reference), unique nonnull(provider,transaction_id) |
| webhook_inbox | id, provider, dedup_key, received_at, safe_payload, processing_status, retry_at, attempts | unique(provider,dedup_key); sensitive fields minimised/encrypted if retained |
| entitlements | id, owner_id, product_id, origin_order_id, state, granted_at, revoked_at | unique(owner_id,product_id); origin order immutable |
| refunds | id, order_id, provider_ref, amount_minor, state, reason | unique nonnull provider_ref; enforce sum completed≤paid |
| advertisers | id, legal_name, billing_contact, status | staff only |
| campaigns | id, advertiser_id, objective, status, starts_at, ends_at, target_countries, category, booking_type, total_minor, currency, impression_cap, exclusive_category | dates valid; FK paid order; approval/payment refs |
| creatives | id, campaign_id, type, asset_path, alt_text, target_url, approval_status, revision | immutable approved revision; no HTML/JS |
| campaign_placements | campaign_id, placement_key, weight, priority, frequency_cap | unique(campaign_id,placement_key) |
| ad_decisions | id, principal_hash, session_id, placement_key, campaign_id nullable, provider, expires_at, status | short-lived; signed decision token; index expiry |
| ad_events | id, decision_id, event_type, occurred_at, trust_tier, valid, rejection_reason | unique(decision_id,event_type); backend controls campaign mapping |
| campaign_delivery_counters | campaign_id, day, placement_key, valid_impressions, clicks | unique(campaign_id,day,placement); atomic updates |
| ad_frequency_counters | principal_hash, campaign_id, day, slot | atomic cap claims; limited retention |
| reward_intents | id, user_id, attempt_id, hint_id, nonce_hash, expires_at, status, provider | single-use; no money or ownership grants |
| enquiries | id, email, company, message, consent_at, status | anti-spam; staff only; length limits |
| consent_records | principal_id, version, purposes, source, timestamp | server-only append; revocation supported |
| analytics_events | id, name, principal_hash, context_id, props, source, received_at | allowlisted fields; no raw notes/email/evidence |
| audit_log | actor, action, entity, previous_hash, new_hash, timestamp, request_id | append only; staff mutations and publication |
| job_runs | job_name, period_key, state, lease_until, cursor, error | unique(job_name,period_key); safe retry |
| idempotency_keys | actor_id, route, key, request_hash, response_ref, expires_at | unique(actor_id,route,key) |

Membership foreign keys must ensure clue assignments/votes belong to the same room. Add composite FKs or equivalent transaction checks, not only member_id references. Case/product mode validation is server-side plus database constraints where possible. Keep case canonical JSON private and deliver projected clues via the API; do not emit it in static assets, source maps, HTML hydration, storage URLs or admin bundles reachable by players.

## 4. Core state machines

### Solo

`created → briefing → investigating(round 1..N) → submitted → revealed` with `abandoned` for expired unused records. `submitted` and `revealed` happen in one transaction at final accusation: validate round/choices, calculate fixed result, persist result, then return explanation. A result exists exactly once. Users can resume an active attempt for seven days; no hard gameplay countdown, display elapsed time only. Later replays use a new unranked attempt and cannot overwrite first results. One active attempt per user/case version; return it on a duplicate start. Explicit abandon permits a new replay, but abandoning a first daily attempt does not allow another ranked first attempt.

All clues in the current round are accessible; next round unlock requires explicit confirmation, not ad completion or timers. Optional open tracking helps UX but does not block accessibility users. At final round accusation is available without opening every card. Suspect and reason IDs must be in the frozen case version; don't evaluate player free text as authoritative answer.

### Group

`lobby → briefing → investigating(round 1..N) → voting → revealed`; `cancelled` from lobby/briefing and `expired` for an abandoned session. Host start is transactional: paid entitlement if required, 4–6 active ready members (tutorial 2–6), unique seats, freeze version and deterministic assignment, set deadline, increment version, emit safe event. Briefing starts the game clock when host confirms; after 60 seconds server advances automatically if host absent, so it cannot stall forever.

Default investigation has three rounds with five-minute soft deadlines; voting lasts three minutes. Host can request the next round early; server requires all active connected members ready-to-advance. At round deadline auto-advance without agreement. Any authenticated member state read/mutation calls `advance_due_state()` under the room lock, so progress works without background execution. Scheduled sweeper is a backup, not the source of correctness. Expired rounds catch up to the correct state without duplicating releases. At vote timeout, missing votes become abstentions.

Presence is a heartbeat hint, not authority. Send heartbeat every 20 seconds while visible. After 60 seconds stale/disconnected, UI marks away. After 90 seconds stale or explicit departure during investigation, promote that member's currently unlocked clues to the shared board. Future round clues assigned to a departed member are promoted at unlock. Do not promote unreleased rounds early. If fewer than two remain, pause progress up to five minutes; on return restore deadlines by the paused duration, otherwise expire with resume/rehost action and no extra charge. Active members may continue as two or three after departure; a new paid game still starts with four. Lobby seat changes permitted; no replacements after start.

Host transfer: on explicit leave or 90-second stale heartbeat elect earliest joined connected member as acting host; original buyer remains entitlement owner. Acting host may advance eligible rounds but cannot create other paid rooms using owner's purchase. Returning original host resumes as a player; no disruptive automatic host reclaim. Reconnect uses original auth identity/membership, not nickname. If browser storage is lost, a new identity cannot claim the previous seat using room code. Offer owner-assisted replacement only in lobby; active-room recovery needs verified account or audited support process.

Private votes immutable. Reveal when all non-departed roster members submitted/abstained or deadline reached. Deterministic group answer: plurality of suspect votes, then among votes for winning suspect plurality of reason IDs. Equal top suspect or reason counts yield “No consensus”; do not choose a correct answer opportunistically. Group solve requires both winning suspect and reason correct. Individual result still shown privately then available on reveal per UI notice. Time is noncompetitive; no global leaderboard in beta. Revealed rooms are read-only; no repeated vote/reveal changes.

### Concurrency

Every mutation uses room/attempt row lock, expected `stateVersion`, invariant checks and event/outbox insertion in the same transaction. Return `409 STALE_STATE` with a safe latest version; client refetches and prompts retry when needed. Idempotency keys replay a previous response only when request hash matches. Atomic joins prevent seventh seat; atomic votes prevent changes; simultaneous last vote/timeout produces one result. Untrusted client clocks do not decide eligibility.

## 5. Evidence assignment and solution

Published content lists public briefing and round clues separately from private canonical answer/explanation. Solo receives every clue unlocked by round. Group distributes round clues round-robin across sorted frozen seats, with an assignment seed recorded once. Use each clue once at initial assignment; public anchors can be shared to all. Every seat must receive at least one useful clue per round for 4–6 players; seed case provides six per round. For tutorial 2–6 players, assign its six clues round-robin in one round. Validation verifies coverage for every supported roster size.

Clue sharing is an authorised server operation, only for an unlocked owned clue; sharing adds a shared-board record. A member cannot fetch another member's unshared clue by guessing clue_id. A case owner cannot fetch full game JSON or answer before completion. Never treat code minification as spoiler protection.

Scoring: suspect correct=60, canonical reason correct=40, total 0–100. Display evidence explanation and alternative elimination after submission. No speed rewards, ad-based score boosts or paid competitive advantages. Record hint use separately. A group “solved” verdict requires 100; 60 is “Right suspect, incomplete explanation”. Replays clearly marked and excluded from first-attempt stats.

## 6. API contract

Implement and generate a validated OpenAPI 3.1 file before R1 exit. JSON only, except provider webhook raw body. All player routes require authenticated identity (anonymous accepted unless stated); public catalogue and enquiry routes excepted. Bearer token or SSR cookie supported consistently. Route handlers are thin: auth, schema validation, authorisation, domain transaction, safe projection. Never allow arbitrary filter/order SQL through query strings.

Envelope: `{data, meta:{requestId,serverTime,stateVersion?}}`; error `{error:{code,message,retryable,requestId,details?}}`. Return 400 invalid, 401 no identity, 403 denied, 404 unknown/unavailable, 409 stale/conflict, 410 expired, 422 invalid transition, 429 throttled, 503 provider unavailable. Error details cannot reveal other members' secrets. Paginated endpoints use opaque cursor, default 20/max100.

| Method/path under `/api/v1` | Body/query | Response/behaviour |
|---|---|---|
| GET `/cases` | mode, themes, moods, difficulty, duration, access, sort, cursor | public deduplicated summaries/prices plus safe discovery metadata; chapter07 semantics |
| GET `/cases/:slug` | mode | safe synopsis and ownership, no clues/solution |
| GET `/daily` | none | today's release, next reset, safe fallback status |
| POST `/solo/attempts` | caseId, mode=solo, releaseDate? | 201 attempt or 200 existing; server resolves version and eligibility |
| GET `/solo/attempts/:id` | none | current phase/round, own unlocked clues, grants, timing |
| POST `/solo/attempts/:id/advance` | expectedVersion | next round or accusation state |
| PUT `/solo/attempts/:id/notes` | text, expectedVersion | private autosaved note, escape on render |
| POST `/solo/attempts/:id/hints` | hintId, source=free/wait | grant if configured and elapsed condition satisfied |
| POST `/solo/attempts/:id/accusation` | suspectId, reasonId, expectedVersion | immutable result and explanation |
| GET `/solo/attempts/:id/result` | none | owner-only result or 409 not complete |
| POST `/rooms` | caseId, displayName | 201 lobby, invite code; entitlement checked |
| POST `/rooms/join` | code, displayName | membership, safe room snapshot |
| GET `/rooms/:id` | none | roster, own current clues, shared board, safe phase |
| POST `/rooms/:id/ready` | ready, expectedVersion | lobby ready/round ready, state-specific |
| POST `/rooms/:id/start` | expectedVersion | frozen roster, briefing |
| POST `/rooms/:id/advance` | expectedVersion | start briefing/advance when rule permits |
| POST `/rooms/:id/heartbeat` | none | server time, safe version; no secret payload |
| POST `/rooms/:id/clues/:clueId/share` | expectedVersion | shared clue record |
| POST `/rooms/:id/votes` | suspectId, reasonId, expectedVersion | submitted flag only until reveal |
| POST `/rooms/:id/leave` | expectedVersion | departure; transfer/promotion rules |
| GET `/rooms/:id/result` | none | member-only revealed result |
| POST `/orders` | productId, priceVersionId | verified account; server priced order |
| POST `/orders/:id/checkout` | provider | hosted URL, expiresAt; reuse pending attempt |
| GET `/orders/:id` | none | owner-safe current payment/ownership status |
| POST `/orders/:id/verify` | none | verified principal; server reconciles provider reference |
| POST `/webhooks/paystack` | raw bytes | signature verification, durable inbox, 200 after persistence |
| GET `/me/library` | cursor | active entitlements and attempts |
| POST `/ad-decisions` | placement, contextId | eligible typed creative or Google/no-ad decision |
| POST `/ad-events` | decisionToken, eventType, eventId | deduplicated accepted/rejected telemetry |
| GET `/ad-click/:token` | signed token | validated fixed-target redirect, records click |
| POST `/reward-intents` | attemptId, hintId | short-lived one-time nonce; optional Google offer |
| POST `/reward-intents/:id/complete` | nonce, clientOutcome | bounded hint grant, trust marked client-reported |
| POST `/advertising-enquiries` | company,email,message | 202, anti-spam, no public listing |
| POST `/events` | allowlisted batch≤20 | 202; first-party consent and retention rules |
| POST `/account/export-request` | none | verified owner; audited request workflow |
| POST `/account/delete-request` | confirmation | verified owner; clear retention caveats |

Admin `/api/v1/admin`: GET/POST cases, POST version/import, POST version/validate, POST version/approve, POST version/publish, POST daily/schedule; GET/POST advertisers/campaigns/creatives, POST creative/approve, POST campaign/activate/pause, GET campaign/report.csv; GET orders/refunds, POST order/refund-request, POST refund/reconcile; GET health/jobs/audit; POST room/support-action. Define schemas, permission and audit event per operation in generated OpenAPI. Public enquiry does not create an approved advertiser.

Representative room snapshot:

```json
{"data":{"id":"uuid","state":"investigating","round":2,"myMemberId":"uuid","myClues":[{"id":"c07","title":"Catering log","body":"..."}],"sharedClues":[],"roster":[{"id":"uuid","nickname":"Tomi","ready":false,"presence":"online","voteSubmitted":false}],"deadlineAt":"2026-11-05T22:10:00Z"},"meta":{"requestId":"uuid","serverTime":"2026-11-05T22:06:00Z","stateVersion":12}}
```

Do not include undisclosed clue IDs/bodies assigned to others or a vote's selections before reveal. Result response is available only after the atomic reveal operation.

## 7. Rate limiting, jobs and provider interfaces

Initial configurable limits: anonymous sign-in 5/min/IP with CAPTCHA after risk threshold; joins 10/min/IP and 5/min/principal; create room 10/day/principal; checkout 5/min/account; heartbeat 6/min/member; ad events 60/min/session; enquiry 3/hour/IP. Use shared durable counters, not per-process memory. For shared networks use combined IP/principal signals and avoid banning all legitimate users at one venue. Return Retry-After and clear UX. Provider webhooks use signature validation/dedup and infrastructure limits, not a public user bucket.

Jobs: room sweeper every minute if hosting tier permits; webhook processing/reconciliation every five minutes; campaign counter aggregation hourly; content-queue warning daily; retention cleanup daily; encrypted export delivery on request. Each has database lease, period key, bounded batch and safe retry. Configure an external managed scheduler if chosen host cannot deliver the needed interval. Correct room transitions and daily releases never depend solely on scheduler punctuality. No fire-and-forget serverless promise for essential financial processing.

PaymentProvider: initialise(order), verify(reference), requestRefund(payment,amount), reconcileRefund(reference). AdProvider: request(placement,context), showReward(intent), telemetry(result). Separate mocks behind `APP_MODE=development`; startup refuses mock payment/Google providers in production with corresponding live flags enabled. Email provider sends verified account login/receipt/support messages; marketing consent is separate.

## 8. Security and performance targets

Reject untrusted asset URLs, URL schemes other than approved HTTPS and unsafe redirect targets. Editorial rich text must be a restricted structured format with escaped text. Advertiser uploads allow JPEG/PNG/WebP only initially, re-encode images, verify actual media bytes, strip metadata, cap 2MB, and cap delivered creative 150KB. No SVG/HTML uploads in beta. Secure headers, strict origin policy, payload size limits, secret scanning, dependency updates, private media signed URL TTL≤120s, and log redaction are required.

Targets under pilot load: 100 simultaneous four-person rooms plus 1,000 active solo clients with staggered actions; p95 ordinary API response≤800ms excluding provider time; p95 state propagation≤2s on stable connection; no private-data cross-access. Initial meaningful render≤2.5s on tested midrange mobile/representative connection, main app JS≤250KB gzip as a target, first free case transfer≤1MB excluding optional ad downloads. If load targets exceed selected provider quotas, report measured limit and right-size before public acquisition. Ads cannot block evidence, lock the UI or hold progress hostage.

## 9. Required discovery extension (v1.1)

Implement chapter07 tables, APIs, filter semantics and metadata migration as part of the core schema, not an optional UI overlay. Extend safe case DTOs with primaryTheme/themes/moods/difficulty, warnings and mode-specific estimates. Generate OpenAPI coverage for taxonomy/facets/interests/recommendations and staff taxonomy administration. Protect interests with owner-only RLS and keep them out of ad-manager views and public catalogue responses. Use preference/catalogue versions for concurrency and invalidation; preserve frozen game metadata. Public cacheable catalogue must never include another player’s Owned badge. If original case detail includes ownership, make that response private/no-store or split a public detail DTO from a private ownership overlay.
