# ADR 001 — Railway and the first playable preview

Accepted 6 November 2026, following the owner's choice of Railway instead of Supabase.

## Decision

Host the Next.js Node application and PostgreSQL in an isolated Railway project with a staging environment. Use `pg` over Railway's private network. Keep business transactions, actor checks and safe projections in framework-independent domain modules. Use PGlite only for local development, SQL integration tests and the E2E harness (which exposes a localhost-only disposable PostgreSQL socket); a deployed preview requires `DATABASE_URL` and `PREVIEW_MODE=true` and refuses an embedded fallback.

This replaces the reference Vercel/Supabase deployment. No Supabase client, PostgREST or browser database credentials are used. Schema files live in `db/migrations`. The reference handoff remains the intended final scope; this ADR describes implemented differences, not removal of requirements.

## Identity and access

The preview uses random 256-bit opaque guest tokens in HTTP-only, SameSite=Lax cookies (Secure on Railway). Only SHA-256 token hashes are stored. Sessions expire after 30 days. Every private read and write verifies session ownership. Private-schema tables revoke PUBLIC privileges and enable RLS; this server-only preview uses the database owner and therefore exercises application authorisation rather than claiming RLS protects owner connections. There is no public database endpoint or browser role.

Email verification, guest-account upgrades/merges, MFA, staff roles, session management and cross-device recovery are outstanding MN-003/MN-011 work. Do not treat this guest session implementation as a complete account system. Clearing cookies loses access to guest progress. Raw IP addresses are not stored; guest-creation rate counters hash the forwarded IP. Trusted proxy attribution and CAPTCHA need a production review. Counters are database-backed, not in memory.

## Content and discovery

Import all five public starter cases as immutable checksum-addressed drafts. Only the three free solo cases are available in this preview. Public API responses contain metadata only; current-round clues and hint grants come from the owner-authorised attempt API. The answer appears only after the result commits. The public repository already contains draft answers, so they are examples, not secret production canon.

Only Everyday Mystery has playable inventory. Other themes are honestly marked coming soon; saved preferences may include future categories. Filters use OR within facets, AND across facets, mode-specific durations, deduplication and disjunctive counts. Drafts have no first-publication timestamp; the API's reference `newest` sort uses stable case IDs and is labelled Featured drafts in the UI. Publication sorting, pagination and retired taxonomy handling remain outstanding. Recommendations rank saved-theme overlap, then stable ID, excluding completed cases. They are a preview subset of chapter07's full scoring model.

## Scope gates

This is a publicly reachable draft preview, not alpha/beta or production readiness. There are no real payment providers, ad scripts, advertiser flows, premium purchases, rooms, sockets or administrative publication endpoints. Group and paid games are denied server-side, not merely hidden. The daily endpoint rotates three practice drafts by UTC day and reports `ranked=false`; it is not the fourteen-case editorial release calendar, streak or ranking system.

Notes are explicitly saved; they are not yet autosaved. Share output contains title and score, never culprit or evidence. Result rendering is owner-only and uses private/no-store API responses. Anonymous session expiry, seven-day attempt expiry/abandonment, verified accounts and scheduled retention need completion before general release.

## Operations and later work

`railway.json` runs schema migration before app startup, exposes `/api/health` and configures bounded failure restarts. Database secrets use Railway references, never copied into source or client configuration. Built-in styling and system fonts avoid third-party requests. CSP currently permits inline Next.js bootstrap scripts; development additionally allows eval for Webpack. Add nonces/strict CSP during hardening before production.

Add a dedicated least-privileged runtime role, migration ledger, backup/restore evidence, monitoring, retention jobs, deployment approval checks, complete OpenAPI generation and load/accessibility tests before broad rollout. Future multiplayer must use durable database state and safe WebSocket invalidations with member checks. Railway buckets can supply private media later; no bucket is needed for text-only draft cases.
