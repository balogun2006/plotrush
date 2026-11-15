# ADR010: Optional interests onboarding and account privacy

15 November 2026. Implemented for the draft preview; activation and release evidence is recorded in implementation status.

## Optional discovery preferences

After the first distinct completed solo/group case, a player without a saved preference version can receive an optional post-result prompt. Choose opens Interests; Skip saves only a local dismissal marker. Neither action is required to finish, start another case or join a room. Direct interests links remain available. Saved/cleared preferences suppress the prompt. No preference values or advertising audiences are stored in the dismissal marker.

An existing guest or verified session can download its UUID preferences as a private, uncached JSON attachment. No email verification is required for this preference-only export. Existing save/clear/opt-out and account merge rules are unchanged.

## Verified account exports and deletion requests

Migration014 adds a principal deletion timestamp, private revisioned privacy requests and a minimal deletion ledger. Sensitive export/deletion operations require a verified account and a session issued within ten minutes. Email re-verification uses the existing sign-in flow and session rotation. Requests are owner-scoped, Origin-protected and rate-limited. There is no client-supplied account ID.

Account export requests are audited and return an owner-only download link. The export is computed in a repeatable-read transaction and served no-store as an attachment; no plaintext export artifact is retained server-side. It contains the owner's profile, UUID preferences, notes, investigation summaries, own group memberships and orders. It excludes case solutions/canon, other players' clues/votes, provider keys, authentication hashes and staff-only records. Export links require a fresh authenticated owner session on every download.

Deletion requests require explicit typed confirmation. Submitting is not erasure: players see pending/deferred/cancelled status and can cancel with a fresh verification and expected revision. Administrators with fresh MFA can review requests. Finance/editorial roles cannot inspect this queue. Queue metadata contains identifiers, revision/state and blocker categories, without email, notes, interests or case canon.

Completion requires operator-supplied approved retention and backup-handling references plus an explicit review assertion. No operating entity, legal basis or statutory period is invented by the application. Active group rooms, active staff grants and all accounts with financial records block completion. Financial-account erasure remains deferred pending a reviewed finance-specific plan and implementation that preserves provider reconciliation. This increment does not change payment code or delete purchases.

For eligible non-financial accounts, completion removes personal investigations/notes and preferences, invalidates sessions/challenges, removes the owner's individual group votes and authenticator secrets, anonymises group display names and account email, and marks the principal deleted. Linked merged guest identities are scrubbed too. Opaque editorial/identity references, aggregate group history, audit records and deletion tombstones remain. Running games cannot race deletion into new orphaned data: principal, auth and room locks fence state changes. Other players' records and immutable case versions remain intact.

## Retention and restoring backups

`pnpm privacy:work` is an operator-only private-database task, defaulting to dry-run. Execute additionally requires approved `PRIVACY_RETENTION_REFERENCE` and `PRIVACY_BACKUP_PROCESS_REFERENCE`. It processes at most25 sufficiently old anonymous principals per transaction: no verified account, purchase, active room, merge or session expiring within the last30 days; principal age must exceed60 days. It also clears bounded batches of old challenge/session/rate-limit records. It is not scheduled or activated on Railway by this release. Those operator references are approval inputs, not a published retention policy.

Administrators can download the private minimal deletion ledger and must retain its current copy securely outside any backup being restored. `pnpm privacy:work -- --replay-ledger <private-file> --execute` re-applies erasures to an isolated restored database before opening it to the application. It rejects replay over financial records needing review. This prevents recorded deleted identities being silently revived when the operator follows the recovery process; it is not automatic remote backup erasure or proof of a separate-volume disaster-recovery system. Backups remain subject to the actual approved expiry/erasure process. Do not delete the ledger or drop additive tables as an application rollback.

## Evidence and remaining dependencies

The privacy tests cover freshness, ownership, competing requests/reviews, revisioned cancellation, negative staff/MFA access, room/financial blockers, private exports, session revocation, another player's preservation, simulated restored-session replay and guarded retention dry-run/execute. A real private-volume backup was restored into a temporary staging database and migration014 applied twice without changing existing account/order/attempt/preference fingerprints. Deletion-ledger replay was exercised on synthetic data, not real user erasure.

The owner authorised one real sign-in email and supplied its code. Staging recovered the existing account in a fresh test session; that test session was signed out. No real account deletion, payment, retention execution or legal-policy approval occurred. The email provider/recovery integration was already configured; no provider flag was enabled by this increment.

The loopback-only development/test adapter permits a higher guest-bootstrap rate for dense independent browser scenarios; deployed production keeps the existing10-per-minute allowance. The test harness additionally provisions a synthetic administrator only in its disposable loopback database. No production administrator is created.
