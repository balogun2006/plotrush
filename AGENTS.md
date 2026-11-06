# PlotRush implementation guide

## Scope and current state

This repository currently contains specifications and development fixtures, not an implemented application. Read README.md and docs/implementation/README.md before editing. Follow the handoff v1.1; theme discovery and optional interests are core scope. The MN ticket prefix is retained for traceability from the original planning documents.

Do not interpret a request to update repository documentation as permission to begin an unrelated full application build. When application implementation is requested, start at MN-001, create a focused branch and work through the actual dependencies. MN-025–029 belong before alpha, not after MN-024 just because their numbers are higher. Record progress in docs/implementation-status.md.

## Required behaviours

- Free solo play cannot require an invitation, email, payment or ad to finish.
- Group guests do not pay individually; host rights do not expose private evidence or hidden votes.
- Server/database time, identity, authorisation and transactions decide game state; no in-memory-only production rooms.
- Solutions, unreleased clues, service keys and personal data never enter public client bundles, logs or shared caches.
- Verify provider signatures, amount/currency/environment and references server-side; fulfil purchases exactly once.
- Purchased sessions contain no Google or direct promotional ads. Discovery preferences are private and not an ad audience.
- Support overlapping theme tags with accurate inventory, explicit filter semantics and honest empty states. Never fabricate category content.
- Starter fixtures contain public demo solutions. Real production case canon must remain private and editorially reviewed.
- Mocks are development-only and labelled; do not claim live integration, editorial approval, independent tests or deployment that did not occur.

## Engineering workflow

Inspect existing code and local instructions before scaffolding. Preserve user changes, pin supported dependency versions, commit lockfile and migrations, and document architecture changes. Implement domain operations transactionally with meaningful negative-access, concurrency and payment tests. Use the contracts in chapter02 and chapter07, and generate OpenAPI schemas during implementation.

Until a web application exists, the only runnable project validation is:

```bash
python3 docs/implementation/validate_starter_cases.py
```

Create the planned app/test scripts rather than pretending they already exist. Run checks appropriate to each change and record actual results. Never overwrite user code to make this repository look like a fresh template.

## Releases and external dependencies

Prepare isolated staging, migrations, approved content, operational checks and recovery evidence before production. Follow chapter05 for deployment. Keep payments, Google ads and direct campaigns independently gated. Unavailable credentials or approvals block only dependent external operations, not useful independent implementation. Do not buy services, contact advertisers, change repository visibility or enable live billing without the user's applicable authorisation.

Do not add an open-source licence or invent the operating entity, legal policies, brand clearance, provider credentials or campaign agreements. Ask for concrete missing inputs only when they are necessary. Keep final handovers clear about implemented, tested, mocked, deployed and outstanding work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
