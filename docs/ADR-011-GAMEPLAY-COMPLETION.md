# ADR011: Gameplay completion and recovery

Date: 15 November 2026. Scope: draft preview; premium release remains disabled on staging.

## Decision

Use database time and transactions for seven-day solo resume windows, explicit abandonment and group recovery. Abandonment preserves notes and the first daily ranking reservation. Revealed results remain immutable. Lazy expiry commits before a rejected mutation; library views also project expiry without relying on a cleanup worker.

Notes have independent revisions. Autosave retries ambiguous network failures using the same request key, preserves unsaved text on conflicts and offers explicit load/replace choices. Text downloads include only the requesting player's unlocked evidence, own notes and already-revealed answers. Group notes never appear in room snapshots, shared events or another player's export. Account merge transfers private notes and archives conflicting guest drafts for the verified owner.

Actor/route/key command receipts bind canonical request hashes for 24 hours and store private response references. Replays return a currently authorised snapshot rather than a shared cached response. Principal locks serialize competing commands. Retention pruning remains inside the existing approved-reference gate and is not scheduled.

Database triggers write revision-only room and attempt outboxes. Group SSE rechecks session and membership, accepts validated reconnect cursors and emits no clue, note, identity or vote content. Connections are bounded, with polling as a fallback. The database remains authoritative.

Only the original owner may recover an expired room. Resume requires returning players and restores the frozen phase, time, assignments and votes; premium entitlement is checked again. Rehost creates at most one linked replacement and rechecks current access without charging guests or issuing a purchase. Refund/dispute holds deny new paid access.

## Release and rollback

Migration015 adds expiry/revision metadata, private note/archive/receipt/recovery tables and durable event triggers. Existing canon and financial records are unchanged. Retain the additive schema during application rollback; older clients do not implement the new expiry/receipt guarantees, so prefer a corrected forward deployment. Recovery rehearsal and actual test/deployment evidence are recorded in implementation-status.md.

Premium six-player/three-round and recovery tests use synthetic local purchases and public draft fixtures. Approved private case canon, live provider acceptance and production operational gates remain separate requirements. No retention policy, legal entity or content approval is invented.
