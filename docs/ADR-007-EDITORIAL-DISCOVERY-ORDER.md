# ADR 007: publication identity and organic featured ordering

Date: 14 November 2026. Status: deployed to Railway staging; source and verification evidence are recorded in implementation-status.md.

## Decision

Add private logical-case discovery records with a persisted UUID, nullable first-publication timestamp, optional featured position and revision. Migration 011 backfills existing cases without changing canonical JSON or saved games. Existing releases use the earliest surviving publication audit/release evidence. Draft fixtures retain a null publication date and no featured selection. New versions register the same logical case; publication records its date once. Database triggers protect the UUID and an established first-publication timestamp from updates.

Public case cards expose only the UUID, UTC publication date and featured position alongside existing safe metadata. UTC timestamps retain PostgreSQL microseconds. Catalogue newest ordering uses first publication descending, then UUID; other catalogue sort ties use UUID. Revising, withdrawing or republishing a case does not make its solution appear newly published.

Personalised recommendations keep the +3/+2/+1 preference score as the primary key, then first publication and UUID. With no interests or personalisation disabled, eligible featured positions sort first (lower numbers first), followed by newest and UUID. Equal featured positions use publication/UUID ordering. Filters, mode/access eligibility, released-version checks, exposure exclusion and separate opt-in replays remain authoritative. The algorithm identifier is `editorial-preferences-v4`. No sponsor, price or advertising field contributes to organic ranking.

Publishers and admins with fresh MFA can set a 1–100 position or remove a pick. The operation locks the logical release and metadata, checks its expected revision and audits actual changes. Editors, finance-only staff, players, stale sessions and racing outdated edits cannot change picks. Setting a pick requires an enabled reviewed release and the existing publication switch; removal remains available with publishing off. Public draft fixtures cannot be promoted through this control without going through the independent release workflow. Withdrawal immediately removes a pick from eligible public results; existing gameplay versions remain unchanged.

## Operations and remaining scope

Apply migration 011 before this application source. It is additive and repeatable, with no new credentials, public networking or feature flag. Keep the new table and triggers during recovery; never delete metadata to roll back an application release. A previous source can ignore this metadata without discarding it, and the existing preference opt-out safeguards must remain in any rollback source.

This does not implement relational theme/mood administration, chapter07 UUID preference endpoints, region targeting or catalogue pagination. It creates no reviewed content and assigns no real featured selections automatically. The current preview recommender remains free-content-only. The existing publication switch is preserved for staging. Full production release and separate-volume disaster recovery remain independent gates.
