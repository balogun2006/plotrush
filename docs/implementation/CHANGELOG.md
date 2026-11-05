# Handoff change log

## v1.1 — 5 November 2026

Adds the user's theme-selection request throughout the implementation/deployment handoff.

- Added chapter07 covering illustrated theme cards, shareable category pages and catalogue filters for themes, mood, difficulty, duration, mode and access.
- Specified multiple tags per case, stable reviewed taxonomy, accurate counts, OR/AND filter logic, exact duration boundaries, deterministic sort/cursors, empty and retired categories.
- Added optional anonymous/account interests with save/skip/edit/clear, safe account merge, private preferences and deterministic recommendations with editorial fallback.
- Added taxonomy/metadata/preferences tables, APIs, editorial publishing/revision rules, caching/invalidation and safe public projections.
- Added contextual theme targeting for direct ads while excluding stored interests from ad targeting and paid placements from organic ranking.
- Added discovery analytics definitions, privacy controls, migration, rollout/rollback and acceptance tests.
- Extended backlog from24 to31 tasks and integrated new dependencies before alpha/beta release gates.
- Added discovery_taxonomy.json and discovery metadata to all five starter case drafts. Case schema is now1.1; taxonomy schema/version is1.0. Story, clue, suspect, canonical answer and scoring content are unchanged.
- Extended fixture validation for theme references, primary membership, duplicates, mood/difficulty and mode-specific durations; no independent gameplay/editorial approval is implied.
- Kept existing solo/group, payment, advertising and deployment requirements. Prior six-screen mockup remains a style reference; theme/onboarding/filter screens require implementation.

The archived filename may retain its original v1 label because this update preserves the existing document's identity and history. README and this changelog identify the current handoff as v1.1. No production application was changed or deployed by this plan update.

## v1.0 — 5 November 2026

Original implementation-to-deployment handoff: free solo, paid solo/group cases, direct advertising, Google adapter, payments, content tooling, tests, deployment and operations.
