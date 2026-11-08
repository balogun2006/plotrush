# ADR005: protected editorial studio and immutable releases

8 November 2026. Extends the Railway draft preview and ADR003/004. This is an editorial vertical slice, not an approved launch catalogue or production certification.

## Implemented behaviour

`/admin` provides a private case desk, text-case JSON authoring/import, machine validation, independent review checklist, immutable publication, withdrawal, UTC daily editorial calendar, seven-day queue-gap indicators and recent editorial audit. Runtime Zod inputs generate the staff OpenAPI paths. The general gameplay API contract is still incomplete.

Staff membership comes from protected PostgreSQL records. No player profile field, client role claim, guessed email allowlist or first visitor can grant staff access. An authorised database operator uses `pnpm staff:manage`; the application has no role-grant HTTP endpoint. Supported roles are content_editor, content_publisher and admin. A fresh email session is required to enroll an authenticator. Both editorial roles may inspect private canon after MFA; ordinary players and other roles cannot.

TOTP uses RFC6238 SHA-1, six digits, 30 seconds and one step of clock tolerance. Enrollment secrets use AES-256-GCM with account-bound associated data and a context-derived key from the existing AUTH_CODE_SECRET. Only initial setup returns the manual enrollment key to the authorised browser; it is never logged or sent to a QR service. Failed verification is rate limited and a consumed time counter cannot be replayed. Successful verification creates a ten-minute opaque staff cookie bound to the current player session. Every protected operation rechecks active membership, role, session binding and expiry. Sign-out, operator revocation or workspace lock invalidates access. Staff session rows and membership reads are locked through content transactions.

Draft updates use revisions and row locks. Submit freezes editing; return to draft clears approval. A publisher different from both the draft author and last editor records logic, accessibility, rights, sensitivity, spoiler checks and actual blind-test evidence. The software does not fabricate editorial or independent test approval. Public publishing and scheduling additionally require FEATURE_EDITORIAL_PUBLISH=true. Withdrawal remains available when this switch is off.

Published content is checksum addressed, and a database trigger prevents canonical content/key/checksum deletion or rewriting. A release pointer selects the version for new starts. Existing attempts and group lobbies retain their version IDs. Editing a published draft creates a separate draft. Emergency withdrawal suppresses new starts and does not fall back to an older preview fixture. It does not immediately terminate existing games or automate refunds.

The preview importer explicitly registers the supplied public draft fixtures. New private drafts live separately and cannot enter the public catalogue by being newer than a published version. Only registered fixtures without an editorial release or an enabled published release appear in the playable view. Safe catalogue projections exclude solutions. Real unpublished case canon must stay out of this public repository and static assets.

## Operation and rollout

See [staff setup and recovery](STAFF-SETUP.md). Migration005 is additive. It preserves existing game/order data, marks old player sessions as not fresh for staff enrollment and registers preview fixtures during import. No real staff account is seeded or granted on Railway. Only the disposable local test harness creates synthetic verified staff identities; it is never used as a deployment seed.

Before source deployment set FEATURE_EDITORIAL_PUBLISH=false if absent, preserve existing provider/auth values, and deploy the web service with the existing migration pre-deploy command. The payment worker need not change for this content-only increment and remains pinned to its tested payment source. Re-running migrations/import does not reset releases, approvals, MFA or games. No actual production case is published by the agent.

Rollback: keep additive tables and pin the preceding application only while no real editorial content has been stored. Older preview code reads newest case_versions directly and ignores withdrawal; after real editorial use, retain the new publication read policy or deploy a forward fix. Never roll back to code that could expose private drafts or restart withdrawn cases. Test restoration before production.

## Verification and remaining scope

Domain tests cover role/MFA denial, session binding/expiry/revocation, RFC vectors, encryption binding, TOTP replay/rate limits, structural invalidity, private draft exclusion, concurrent stale saves, independent approval, publication gates, immutable content, old solo/group versions, withdrawal without fixture fallback, UTC calendar eligibility and audit projections. Browser tests use two independent synthetic staff accounts and real compiled Next routes. Their checklist/blind-test notes are explicitly synthetic fixtures, not evidence of human review.

The editor currently supports the application's normalized text-case schema. Guided rich-media authoring, licensed asset uploads, full relational/versioned taxonomy administration, external review evidence attachments, queue notifications, bulk content tools, daily game selection/streaks and production security/restore drills remain open. The UTC calendar stores approved snapshots but is not yet wired to a public daily puzzle selector. Paid gameplay and commercial release remain blocked. No external merchant/email operation or editorially approved case is claimed.

TOTP references: https://www.rfc-editor.org/rfc/rfc6238 and https://www.rfc-editor.org/rfc/rfc4226 .
