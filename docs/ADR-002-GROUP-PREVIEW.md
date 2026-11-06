# ADR 002: durable free group tutorial

6 November 2026. Extends the Railway preview; not a production or beta release.

## Decision

Implement the free `missing-mic` tutorial for 2–6 anonymous players before enabling paid rooms. Existing opaque cookie principals provide membership identity. A nickname or invite never recovers somebody else's seat. Verified email upgrades, account merge, staff roles and MFA remain MN-003 work; this tutorial does not depend on a paid or verified host.

`002_rooms.sql` adds private rooms and relational memberships with an active-seat uniqueness constraint. Canonical assignments, shared clue IDs, votes, phase, deadline and final result are persisted in the room's private JSONB aggregate. All reads that advance time and all commands lock the room row. There is no browser database API and no client access to raw room state. The API explicitly projects only the requesting member's unlocked clues, shared evidence, their own vote and a completed result. The host gets no additional clue/vote visibility.

This aggregate design differs from chapter02's separate assignment/vote/result tables. It keeps one transaction boundary for the preview; typed domain operations enforce invariants. Split these tables and add append-only domain events/outbox before expanded operational reporting or external realtime consumers. Do not interpret JSONB storage as permission to return the aggregate directly.

Three-second, private no-store state polling replaces Supabase Realtime. Visible tabs heartbeat every20 seconds; heartbeats do not increment the gameplay revision unless they cause a state transition. Polling is bounded per visible room tab but has not been load-certified. Paid rooms and arbitrary content are rejected even if payment environment variables are present.

## Game rules delivered

- Six-byte random invite code, SHA-256 hash stored in PostgreSQL; the creator retains the original in sessionStorage for copying. The invite URL grants lobby joining only, never old-seat recovery or secret access. A lost creator invite cannot be fetched from the hash; create another free room.
- Atomic joins, duplicate-join resume, distinct case-insensitive display names, 2–6 present and ready players to start. No replacements after start. Lobby departures may rejoin with the same identity.
- Frozen case version at creation and deterministic round-robin assignment by frozen seats at start.
- One-minute briefing fallback; five-minute rounds; three-minute voting; state reads catch up due transitions using database time. No cron dependency for correctness.
- Free voluntary evidence sharing verifies current-round ownership. Away status after60 seconds; acting host transfer and promotion of unlocked evidence after90 seconds. Future evidence is never promoted early. Explicit departure revokes reads immediately.
- Fewer than two connected players pauses up to five minutes; return shifts deadline; otherwise expires. All rooms expire after24 hours. Recovery is a new free tutorial, not paid entitlement restoration.
- Immutable private votes and one reveal under the room lock. Suspect plurality then reason plurality among winning-suspect votes; ties produce no consensus. Missing votes abstain at deadline. Result and explanation survive reload.
- Optimistic version conflict handling. UI retries once for ready/share/vote if the phase is unchanged; it does not silently advance across changed phases. No generic idempotency-key store yet. A lost create response may create another free lobby on retry.

## Remaining scope

MN-007–010 are partial against the full handoff: paid entitlements/rehosting, verified seat recovery, staff moderation, realtime invalidations/outbox, request idempotency, scheduler sweeps, room notes and full retention/cleanup remain outstanding. No guest replacement during an active game and no unrestricted impersonation. No live advertising or checkout. Editor-approved private production content and independent blind playtests remain launch gates.

## Payment configuration

Owner authorised nonfunctional placeholders. `.env.example` and Railway staging have `PAYSTACK_SECRET_KEY=replace_me`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=replace_me`, and independent false payment/direct-ad/Google-ad flags. These values are not working credentials; no payment adapter or checkout is activated by replacing them alone. Commerce must add server verification, webhook signature checks, amount/currency/environment checks and exactly-once fulfilment before activation.

## Verification and deployment

See implementation-status.md for actual results. Migration is additive and idempotent; rerunning it does not clear existing solo or room data. Rollback can pin Railway to the previous application commit while leaving the additional tables intact. No destructive down-migration or backup certification is claimed.
