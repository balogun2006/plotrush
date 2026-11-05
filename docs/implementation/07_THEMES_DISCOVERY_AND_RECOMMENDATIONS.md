# 07 — Themes, discovery, interests and recommendations

Added in handoff v1.1, 5 November 2026. Required product scope, not an optional future enhancement. Implement alongside the existing solo/group catalogue. This file is authoritative for discovery semantics; it does not change payments, private evidence, scoring or ad-free ownership rules.

## 1. User experience

Home retains “Play solo — free” and “Play with friends”, followed by “What are you in the mood for?” with illustrated theme cards. Each card has label, one-sentence description and count of distinct currently playable cases. Selecting a theme opens its catalogue page, preserving the selected play mode. A theme is a way to find games, not a different game engine.

Full catalogue filters: themes, mood, difficulty, duration, play mode and free/premium access. Desktop uses a sidebar or compact top bar; mobile uses horizontally scrollable theme chips plus an accessible filter sheet with selected count, Apply and Clear. Applied filters remain visible as removable chips. Browser back, refresh and shared URLs reproduce the same public filter selection. Sort defaults to newest; optional duration ascending and difficulty ascending are deterministic.

Every case card shows primary theme, difficulty, estimated duration, supported mode and free/premium status. Secondary themes appear in details. Never display premium as free because the viewer already owns it: use a separate “Owned” badge and “Play” action. Display player count only for the selected group mode. A single case supporting both modes appears once, not twice in counts.

Theme examples: Thriller, Cold Case, Wedding & Family, Heist and Supernatural. Additional accurate seed category: Everyday Mystery. These can overlap; a case has one primary theme and up to three total themes. Mood is separate: Lighthearted, Suspenseful, Dark. Difficulty is exactly one of Beginner, Intermediate or Expert. No theme is assumed to imply difficulty, price, mode or age suitability.

## 2. Taxonomy and editorial definitions

`discovery_taxonomy.json` is the seed authority for stable IDs/slugs, labels, definitions and display order. Theme slugs: `thriller`, `cold-case`, `wedding-family`, `heist`, `supernatural`, `everyday-mystery`. Mood slugs: `lighthearted`, `suspenseful`, `dark`. Difficulty slugs: `beginner`, `intermediate`, `expert`.

Thriller requires meaningful suspense/stakes; Cold Case means an older unresolved investigation reopened through records; Wedding & Family concerns celebrations/family relationships; Heist involves a planned theft or its investigation; Supernatural involves apparent paranormal events and states whether the resolution may be supernatural; Everyday Mystery concerns smaller contemporary puzzles. Do not tag a fresh missing parcel as Cold Case or every theft as a Heist to populate empty shelves. Tags must not disclose culprit, motive or twist.

Publishable case discovery metadata:

```json
{"primaryTheme":"wedding-family","themes":["wedding-family","thriller"],"moods":["suspenseful"],"difficulty":"intermediate","contentWarnings":[],"estimatedDurationMinutes":{"solo":20,"group":25}}
```

This is a schema example, not an instruction to classify the existing wedding draft as a thriller. Each assigned tag must pass review. Estimated duration is a positive integer per supported mode; unsupported mode fields are absent. Legacy `durationMinutes` remains for import compatibility in seeds v1.1 and equals the maximum supported-mode estimate. New runtime code uses the selected mode estimate. Content warnings are descriptive and separate from mood; “Dark” alone is not a complete content warning. Admin must supply reviewed warnings or explicitly confirm none.

Publication validates active taxonomy references, one primary theme included in nonempty themes list (1–3), nonempty moods (1–2), unique IDs, exactly one valid difficulty, duration for every supported mode, safe text/assets and warnings review. Technical validation cannot decide whether a story truly fits a tag. Published versions retain a discovery metadata snapshot; public catalogue projects only latest approved/published metadata. Changing published tags/estimates creates a versioned metadata revision and invalidates catalogue caches without changing clues, answers or existing attempts' frozen snapshot. Do not duplicate a whole case in discovery because it has multiple tags.

Taxonomy labels/descriptions/art/display order can be edited by content staff; publishing/deactivating a taxonomy entry requires publisher permission and audit. Slugs and IDs remain stable; label changes do not break links. Deactivate rather than delete a referenced entry. Retired slugs have a public archive/unavailable page with alternatives (no empty promise), and API filter use returns a clear unavailable-filter error. A slug rename requires a managed alias and permanent redirect. No free-text tags or inferred tags accepted from a player.

## 3. Availability, counts and honest launch

Launch goal: three well-stocked promoted themes—Thriller, Cold Case, Wedding & Family—provided content supports them. A promoted homepage theme needs at least three distinct published/playable cases, including at least one free solo option. Require three such themes before broad theme-led advertising. This sits alongside the existing fourteen daily cases and two premium cases; multi-tag cases count in each matching shelf but remain single distinct titles in total catalogue metrics. Do not claim nine unique games simply because three games each have three tags.

The five supplied drafts genuinely populate Everyday Mystery and Wedding & Family only. Thriller, Cold Case, Heist and Supernatural are taxonomy seeds, not supplied playable content. Do not retag the included drafts inaccurately or fabricate cases. Alpha may expose populated shelves and explain that further themes are coming. Zero-case themes are not selectable filter chips or promoted homepage cards; optional clearly disabled “Coming soon” teaser is distinct from playable categories. Heist/Supernatural remain unpromoted until suitable approved content exists.

Count eligibility: published, visible, not withdrawn, released, and supported in current mode/market. Counts include free and premium unless the current access filter says otherwise; ownership is not price classification. A missing local checkout does not hide a playable free case, but a paid-only product that cannot be purchased or accessed in that market must not be advertised as playable to a nonowner. Existing owners retain legitimate access. Response uses one availability snapshot so counts/results agree.

Empty result: “No cases match these filters yet.” Show clear filters and explicitly labelled suggestions outside the current filter; never silently relax Free, mode or content settings. Count facets using disjunctive faceting: keep all active filters except the facet being counted; count unique case IDs for each candidate value. Main result total always uses every filter. Counts are discovery counts, not live player counts.

## 4. Filter and URL contract

Routes: `/themes`, `/themes/[slug]`, `/explore`, `/interests`, `/account/interests`. `/solo` sets mode=solo; `/explore?mode=group` is the group discovery entry. Existing direct case/invite URLs work without onboarding.

Canonical example: `/explore?mode=solo&themes=cold-case,thriller&moods=suspenseful&difficulty=beginner&duration=lt10&access=free&sort=newest`. Arrays are comma-separated, trimmed/deduplicated/sorted stable slugs. OR within each multi-value facet, AND across facets. Limit themes to6, moods to3 and difficulty to3; reject unknown/retired slugs or values with clear 400 FILTER_INVALID/409 FILTER_UNAVAILABLE rather than arbitrary SQL or silently returning unrelated results. Category page unknown slug is404; retired page is410 with alternatives or redirects if an explicit alias exists. Query length≤2048 bytes.

Duration buckets for integer minutes: `lt10`=1–9; `10to19`=10–19; `20to30`=20–30; `gt30`=31+. Display “Under 10 min”, “10–19 min”, “20–30 min”, “Over 30 min”. Match selected mode estimate. If mode=any/omitted, case matches when at least one supported mode estimate falls in the bucket; indicate the matching mode/duration on the card instead of showing a contradictory aggregate. No overlapping boundary at10,20 or30. `access=free|paid|any` uses Premium as the paid UI label. Preferences do not silently prefilter a public shared URL.

`sort=newest|duration_asc|difficulty_asc`. Newest uses first-published timestamp descending then case UUID; duration uses matching-mode estimate ascending then case UUID; difficulty orders beginner/intermediate/expert then case UUID. Cursor encodes filter hash, taxonomy/catalogue revision, sort and last key; reject a cursor reused under different filters. After a catalogue revision invalidate stale cursor with409 and restart gracefully rather than returning duplicates/omissions. Cache public responses by canonical filters, market and revision; no identity/owned badge inside a shared cache.

## 5. Optional interests

After first completed case, offer “Make your next mystery more your style” with multi-select themes/moods and optional preferred difficulty, then Save or Skip. Provide a direct optional Interests page as well. No email/payment/invitation needed; creating an anonymous identity for Save is acceptable. Never gate case start or an invitation behind this step. Skipping sets only a local dismissal marker; do not repeatedly interrupt. User can clear interests and opt out of personalised recommendations any time.

Persist interests for a valid anonymous principal, allow later account upgrade/merge. Anonymous browser-data loss loses unsaved cross-device identity as before. Verified-account preferences win on merge unless the player explicitly chooses to replace them with the anonymous choices. Use expected preference version on writes; never silently overwrite changes from another tab. A user may delete preferences without deleting purchases/progress. Preference deletion and recommender opt-out take effect on the next request, including cached-client state invalidation. Treat interests as private; no public profile or advertiser disclosure. Do not use discovery preferences to create behavioural advertising audiences in this release.

## 6. Recommendations without AI

At home/solo catalogue show an optional “For you” rail. Use server-side deterministic ranking on eligible published cases, within explicit mode/market/access filters and reviewed content constraints. Theme selection is an explicit filter; recommendation score never overrides it. Exclude completed/exposed case IDs by default across solo/group/version so another version of the same solution is not promoted as new. If none remain, show an explicitly labelled replay/archive option or “More mysteries are coming”. Do not invent unseen inventory.

Version1 score: +3 if at least one preferred theme matches; +2 if at least one preferred mood matches; +1 for preferred difficulty. No extra points for number of tags, payment price, sponsor status or ad revenue. Tie-break first-published descending, then case UUID. Return at most10 with a short honest explanation such as “Matches your interest in Cold Case”. With no preferences or personalisation disabled, use an editorial featured list filtered for eligibility, then newest. Render that rail as “Featured mysteries”, not a false personalised claim. Initial recommendations do not learn from hidden behavioural profiling.

An explicit “Include completed” control is required for replay recommendations; report these separately. No paid placement inserted into organic recommendations; a separately labelled advertisement retains existing ad eligibility rules. Purchase ownership changes CTA, not suitability rank. Remove/unpublish/region changes recheck before play/purchase even if an older recommendation card remains visible.

## 7. Engineering model and endpoints

New tables: `themes(id,slug,label,description,image_path,display_order,status,promote_on_home,revision)`; `moods(id,slug,label,status,revision)`; `case_version_themes(case_version_id,theme_id,is_primary)`; `case_version_moods(case_version_id,mood_id)`; `case_discovery_metadata(case_version_id,difficulty,duration_solo,duration_group,warnings_json,warnings_reviewed_at,revision)`; `player_interests(user_id,theme_ids,mood_ids,preferred_difficulty,personalisation_enabled,version,updated_at)`; `catalogue_revisions(id,changed_at)`. Unique joins, one primary per published version, FKs and validation transaction enforce completeness; index theme/mood→version, difficulty and durations. SQL arrays in interests require FK-equivalent membership validation; normalised interest join tables are acceptable. Interest reads/writes are owner-only with RLS, canonical taxonomy metadata public only when approved, private game JSON remains private.

Seed JSON `id` values are stable logical keys/slugs, not database UUIDs. Importer upserts by stable slug, maps keys to persisted UUIDs and resolves every join/preference reference; never changes existing UUIDs on reimport. Public routes/filter queries use slugs; authenticated interest API `themeIds`/`moodIds` use the UUIDs returned by the taxonomy API. Difficulty remains the fixed enum. Document this mapping in generated schemas so a string seed key is never inserted into a UUID FK.

Separate public catalogue DTO from private case JSON and owner-specific overlay. Published filters use safe metadata tables, never query solution text. Recommendations/owned/progress are `private,no-store`; public taxonomy/filter metadata can cache by revision. Staff ad reporting cannot read interest records. Case publication atomically validates taxonomy, updates safe projection/revision and emits invalidation. Backfill old drafts through explicit reviewed mapping; do not guess tags for existing production cases.

HTTP contracts, to include in generated OpenAPI:

| Method/path under `/api/v1` | Request | Result |
|---|---|---|
| GET `/themes` | mode,market + active public filters | enabled taxonomy, availability/facet counts and revision |
| GET `/discovery/facets` | all public filters | theme/mood/difficulty/duration/access counts, total, revision |
| GET `/cases` | extended filter/sort/cursor contract above | deduplicated safe catalogue DTOs, total, nextCursor, revision |
| GET `/themes/:slug` | mode/market | safe description/art, eligible count; no private clues |
| GET `/me/interests` | authenticated anonymous/permanent identity | own selections, personalisationEnabled, preferenceVersion |
| PUT `/me/interests` | themeIds,moodIds,preferredDifficulty,personalisationEnabled,expectedVersion | replace validated interests, new preferenceVersion;409 on conflict |
| DELETE `/me/interests` | expectedVersion | erase selections, disable personalisation, increment version |
| GET `/me/recommendations` | mode,access,limit≤10,includeCompleted=false | eligible ranked DTOs, reasonCode, algorithmVersion, preferenceVersion |
| GET/POST `/admin/themes` | authorised taxonomy schemas | review/create/update/deactivate/promote with audit |
| GET/POST `/admin/moods` | authorised taxonomy schemas | reviewed mood metadata; stable slug handling |

Admin case version/import/publish API additionally accepts required discovery metadata. Add publisher conflict checking when deactivating referenced tags, redirect aliases and launch-shelf readiness report. Preference mutations require CSRF/origin/ownership protections already specified. Use error envelope from engineering spec. Rate limit recommendation reads and preference writes with configurable per-user limits; no paid AI/inference dependency.

## 8. Ads and analytics

Direct campaigns may optionally target current catalogue theme context, not stored player interests. New approved campaign field `context_theme_ids`; any selected context theme can match. Ad decision server derives current valid context from requested route/filter and eligibility; contextual fields are user-influenced, not verified demographic intent. Do not advertise these as verified behavioural audiences. Empty/invalid themes do not create inventory. Exclusion rules/paid-session protections and consent still win. Sensitive personal attributes or identity inference from fictional themes is prohibited in this scope.

Events: `theme_card_viewed` (client), `theme_selected`, `catalogue_filters_applied`, `catalogue_no_results`, `interest_prompt_skipped`, `interests_saved` (server), `interests_cleared` (server), `recommendations_served` (server), `recommendation_clicked` (client). Attach taxonomy revision, safe stable IDs, mode, source, algorithm version and request context; never names, notes, answers or full query strings. Impression events do not prove user intent. Continue existing consent/retention controls. Preferences are deleted with account/preferences request, not copied into permanent raw analytics snapshots.

Report theme-to-start, start-to-completion, purchase conversion and eligible day7 return, split by country/mode/free-paid/source. Freeze selected discovery context at attempt/order creation for attribution; never rewrite historical metrics when tags change. A multi-tag case is counted once in a selected discovery-context funnel, with multi-tag breakdown explicitly nonadditive. Recommendation-attributed purchases use documented window/link context, not causal claims. Do not infer preference success from clicks alone; no invented CTR/conversion targets.

## 9. Implementation order and acceptance

MN-025 taxonomy/schema/import/backfill depends MN-003/004. MN-026 theme cards/routes/filters depends025/002. MN-027 interests/anonymous upgrade depends025/003. MN-028 recommender depends025/027/005/010. MN-029 editorial taxonomy admin and content coverage depends025/014. MN-030 contextual ads/analytics depends026/016/020. MN-031 integrated QA/migration/deployment gates depends026–030. These extend the existing24 tickets; numbering does not imply implement them after production. Include025–029 in R1 and030–031 before R2 readiness; MN-021/022/023/024 gates now depend on the relevant new tickets.

Required tests: OR/AND filters; all duration boundaries; no duplicate multi-tag rows; matching-mode durations; exact counts incl eligibility/ownership/markets; paid not silently substituted for Free; empty/retired/unknown themes; public-page cache isolation; URL back/refresh/share; anonymous save/skip/clear/upgrade/conflict; deterministic rank/ties/fallback and completed exclusion; no preference leakage to other accounts/admin ad roles; category edits/caches and frozen game snapshots; inaccessible filters by keyboard/screen reader; preview campaign context never billed; new schema migration/backfill preserves previous games and entitlements.

Release checks: theme entry points working at360px; group/solo links retain mode; public chips show only available inventory; promoted shelves pass content threshold; preference onboarding remains skippable; recommender works when no interests/ad consent declined; rollback compatible with new metadata and clears stale caches. Report current inventory truthfully: supplied seed fixture structural tests do not satisfy the three-theme launch-content gate.
