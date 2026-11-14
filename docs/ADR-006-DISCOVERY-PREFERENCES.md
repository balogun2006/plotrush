# ADR 006: private discovery preferences and merge precedence

Date: 14 November 2026. Status: deployed to Railway staging; see implementation-status.md for the source and verification evidence.

## Decision

Extend the existing owner-only interests record with moods, nullable preferred difficulty and an explicit personalisation switch. Migration 010 is additive and repeatable. Defaults preserve existing theme-only records. Theme/mood choices remain validated stable preview slugs; they are not taxonomy UUIDs. Relational taxonomy and the chapter07 UUID-based `/me` contracts remain separate work.

The shared Zod input contract validates bounded unique selections and revision numbers. Domain writes hold the existing principal lock, compare the saved version and update all preference fields atomically. Old theme-only API writes retain omitted fields, including an existing opt-out. Private GET/PUT/DELETE responses use the existing no-store envelope, identity checks, Origin enforcement and write limits. Staff and advertisers receive no new preference access.

Switching personalisation off retains choices for optional reuse but gives them zero recommendation weight. Deleting interests clears themes, moods and difficulty and disables personalisation. A version tombstone remains to reject stale-tab writes; gameplay, notes and purchases are unaffected. A timestamp-only browser storage signal refreshes another open recommendation rail without putting the choices in browser storage. Focus refresh also handles returning to the page; older requests cannot overwrite a newer response.

During a verified-account merge, saved destination preferences win, including empty/disabled choices. Guest choices transfer if the destination has never saved preferences. A separate unchecked control permits explicit replacement with the browser's choices after email proof and progress-merge confirmation. Guest preference rows are then removed. Upgrading the same identity preserves every field. No implicit union of choices is performed.

The deterministic preview algorithm is `preview-preferences-v3`: +3 for any theme overlap, +2 for any mood overlap, +1 for preferred difficulty. Each dimension scores once; multiple tags give no bonus. Reasons describe actual matches. Opt-out and no-preference responses are labelled Featured mysteries. Existing explicit filters, eligibility and cross-mode/version exposure exclusions remain authoritative. The exposure total is now named `exposedCount`, rather than suggesting all started cases were completed.

## Limits and operations

First-publication timestamps, editorial featured ordering, relational taxonomy UUIDs and catalogue pagination remain outstanding. Featured currently uses the existing deterministic eligible-preview order; no editorial curation is implied. There is no new content, provider integration, ad audience or hidden behavioural profiling.

Apply migration 010 before running this application version. Keep its columns during application recovery. Although older code can still use the additive schema, an older release that ignores the personalisation switch or unions account interests is not a behaviourally safe rollback after users have opted out. Prefer a forward fix or a compatibility-patched rollback that honours those choices. A private pg_dump backup was restored into a temporary database on the existing staging Postgres service, migration 010 was applied there, and data-preservation checks passed before deployment. The temporary database was removed and the backup retained privately on the existing database volume. This is not a separate-service or separate-volume disaster-recovery rehearsal. Scheduled platform snapshots were unavailable on the current workspace plan; no plan upgrade was performed.
