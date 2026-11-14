# ADR009: Discovery filters, pagination and editable taxonomy

14 November 2026. Supersedes ADR008's listed implementation gaps for the current draft preview.

## Behaviour

Catalogue theme, mood and difficulty controls support multiple selections, OR within a facet and AND across facets. Mobile controls use a native modal dialog with draft selections, Apply, Cancel, Escape and focus return. Applied values are individually removable. URL history, refresh and page links retain the selection. Zero-inventory values are not offered as new playable filters; selected empty values remain removable.

The catalogue defaults to 24 cases per page, accepting limits 1–50. A cursor contains the last stable case ID, catalogue revision and a hash of canonical filters, page size, sort and the fixed preview market. A different selection rejects the cursor with400; an intervening catalogue edit returns409 CURSOR_STALE. Restart removes the cursor and retains filters. Totals and disjunctive theme/mood/difficulty/duration/access/mode counts use the whole eligible catalogue from the same repeatable-read transaction, independently of page size. Responses remain uncached and contain no identity overlay.

## Taxonomy and immutable content

Migration013 adds moods, managed theme aliases, catalogue revisions, version-to-theme/mood relationships, safe per-version discovery metadata, and normalized private interest relationships. Foreign keys and unique joins enforce persisted identities. Existing case JSON is mapped explicitly from its supplied tags without inferring tags or editorial approval. Known publication evidence supplies existing warning-review dates; draft review dates remain null. New publication requires active themes and moods under shared locks and records the review timestamp.

Public discovery reads relational metadata. Gameplay continues reading the original immutable version snapshot. Reviewed tag changes go through the existing draft/review/publication flow and create another immutable version. Changing a label or URL does not rewrite clues, answers, checksums or saved investigations.

Publisher/admin creation, edits, retirement and renames require fresh MFA, the publication switch and an audit reason. Updates check expected revisions. Concurrent theme creation and rename operations serialize their shared slug/alias namespace. Theme renames preserve UUIDs and reserve every old slug as an alias pointing directly to the same UUID, preventing chains and reuse. Old browser and API URLs return permanent308 redirects with public filters preserved. Retired browser URLs now return actual410 HTML with escaped, filter-preserving alternatives; unknown categories remain404. Mood IDs/slugs remain stable; labels and status are editable. Playable references prevent retirement of either kind.

`GET/PUT/DELETE /api/v1/me/interests` use `themeIds` and `moodIds` UUIDs returned by `/themes`, with `preferenceVersion` on reads and `expectedVersion` on writes. The Interests screen uses this contract. Legacy `/interests` slug requests remain supported, including omitted-field preservation and existing account merge behaviour. Old theme slugs are resolved through aliases on reads. Database triggers maintain FK-backed private interest joins through legacy writes, deletion and account merges. Retired saved choices can be retained or removed; newly selecting them is rejected. Recommendations use current labels for both themes and moods.

Migration012's seed insertion now skips a slug reserved as an alias, so a repeated bootstrap cannot recreate a renamed seed. Migration013 replaces the old fixed mood-membership check with registry validation and private FK projections. Repeated migration preserves identities, preferences, canon and metadata. No service credentials, provider settings or release switches are added.

## Release and recovery

Apply migrations before deploying this version. Keep the additive tables and aliases if rolling back. A version that ignores aliases or dynamic taxonomy is not a safe behavioural rollback after staff create or rename tags; use a compatible application or a forward fix. Do not drop the new tables or rewrite case canon to roll back. Public responses are no-store, and catalogue revisions fence older cursors.

Before release, a private PostgreSQL dump was restored into a temporary database on the existing staging service. Migrations012/013 passed twice there, preserving original account/order/attempt/preference fingerprints and discovery identities. All case versions had complete projected metadata and matching tag counts. The temporary database was removed and the private dump retained on the volume. This does not prove recovery from service or volume loss; separate-service recovery and scheduled platform backups remain production operations work.

This completes the six items listed as discovery/theme tools in area1 for the current draft preview. It does not implement private-interest onboarding/deletion beyond selections, paid-market availability, ads, analytics, approved launch inventory, or the complete cross-module MN-031 beta gate. The preview continues to expose eligible free drafts and accurately reports empty premium filters. No content approval or launch readiness is implied.
