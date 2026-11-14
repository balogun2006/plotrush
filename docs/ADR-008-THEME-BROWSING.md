# ADR008: Persistent theme browsing and editorial controls

14 November 2026. Status: implemented for the draft preview.

Migration012 introduces a private registry for the six supplied themes, with stable UUIDs, immutable slugs, editable labels/descriptions, ordering, retirement and requested homepage promotion. Reapplying the migration preserves edits and IDs. Case tags and preference contracts continue to use the existing seed slugs; this is not the complete relational taxonomy contract.

The theme directory and category routes derive counts from eligible free preview cases. Counts replace the theme filter while retaining mode, access and other filters. Empty themes are disabled directory tiles; known empty categories explain the absence of cases. Unknown categories return404. Retired-theme API requests return410 with safe alternatives; the browser currently renders the unavailable page with HTTP200. Correct HTML410 handling remains outstanding.

Public discovery reads use a repeatable-read snapshot. Non-tutorial group modes are excluded from the free preview projection. Case cards choose a mode matching the filters and duration, and group links carry the selected case. Labels are projected from the registry without rewriting immutable case canon or checksums. Saved retired preferences remain removable; selecting a new retired theme is rejected.

Fresh-MFA editorial staff can inspect taxonomy. Publisher/admin edits additionally require the publication switch, a reason and the expected revision. Row locks serialize changes; publication takes shared theme locks so retirement cannot race a release. Retirement is blocked while playable content references the theme. UUIDs/slugs cannot be changed or deleted. Every edit is audited. Finance roles have no access.

Requested homepage promotion requires three distinct reviewed eligible cases including a free solo case. Public promotion is recomputed from current supply and current-view availability, so withdrawal cannot leave a misleading promoted shelf. Draft quicklinks remain explicitly labelled; no publication dates, approved content or inventory are fabricated.

Apply migration012 before application startup. Keep the additive registry on rollback; application versions must respect retirement and label changes. A private database-volume dump was restored into an isolated temporary database on the same service, and migration012 applied twice with existing data fingerprints and seeded identities preserved. This is limited recovery evidence, not recovery from service/volume loss.

Remaining work includes mood administration, creating new taxonomy entries, slug aliases, relational case tags, UUID preference contracts, pagination, full filter controls and proper retired-page HTTP410 responses. Content approval and production operations gates still apply.
