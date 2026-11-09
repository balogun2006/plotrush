# PlotRush editorial staff setup

Use the PlotRush **staging** environment and **plotrush-web** service. Do not use the unrelated VultPay projects. `/admin` is available after deployment, but has no default administrator and no public self-enrollment for staff membership.

## Prerequisites

1. Configure real Resend email delivery using [Railway variables](RAILWAY-VARIABLES.md). Keep the existing random AUTH_CODE_SECRET stable; it now also protects encrypted authenticator keys through a separate derived key.
2. Each staff member verifies their own email on `/account`. Use two distinct accounts for editing and independent publisher approval. No authenticator or staff secret is needed from the owner in chat.
3. An authorised database operator opens a Railway SSH shell for **plotrush-web**, or another controlled environment with its private DATABASE_URL. Run these operator commands, substituting the actual verified emails:

```bash
pnpm staff:manage grant editor@your-domain.example content_editor
pnpm staff:manage grant publisher@your-domain.example content_publisher
```

The example emails are placeholders, not actual accounts. `grant` replaces that account's role list, reactivates membership and invalidates existing staff sessions. `admin` permits both editorial roles, but cannot bypass independent review of its own authored/edited drafts. Operator changes are recorded as operator actions against the affected principal; retain your Railway/operator identity in the operational change record.

Do not put these grant commands into an automatic build/start/migration command, and do not expose PostgreSQL publicly to run them.

## Staff sign-in

Sign out and verify email again immediately before first enrollment. Visit `/admin`, generate a setup key and add it manually to an authenticator app: issuer PlotRush, SHA-1, six digits, 30-second period. Keep the key private. Enter a current code to confirm enrollment and unlock the studio. Setup expires after ten minutes; generating a replacement pending setup invalidates the previous pending key.

Subsequent visits use the authenticator. Staff verification expires after ten minutes and remains bound to the signed-in browser session. A used code cannot unlock a second session in the same time step; wait for the next code. Lock workspace clears its staff cookie and invalidates that staff session. Ordinary account sign-out also prevents that staff token from authorising requests.

## Review and publication

- Load a public example or paste a normalized text-case JSON document. For a new case, choose a unique lowercase hyphenated key and slug. Maximum request body is200KB. Media asset editing is not implemented.
- Create/save a draft; server validation checks IDs, references, rounds, hints, answer eliminations, theme membership and player bounds. Saving does not publish.
- Submit for review. A different publisher records actual review and blind-test evidence. Neither author nor last editor can approve the draft. Return to draft before making changes; that clears approval.
- Keep `FEATURE_EDITORIAL_PUBLISH=false` on staging until staff access and review procedures have been checked. When ready for reviewed staging content, set it to `true` on **plotrush-web** and redeploy that service. No new credentials or worker variables are required.
- Publish and confirm the approved version. Existing games retain the prior snapshot. To edit a published case, create a new revision.
- A publisher can withdraw a release with a reason even when the publication switch is false. Withdrawal blocks new starts and suppresses preview fallback, while preserving existing games. Immediate unsafe-content shutdown and customer restoration/refunds remain separate work.
- Calendar slots require a currently released free solo mini case, within the next90 UTC days. The slot pins its version. Seven-day queue indicators show missing/withdrawn cases. Public daily selection/streaks are not connected yet.

## Revocation and recovery

An authorised operator can revoke access:

```bash
pnpm staff:manage revoke staff@your-domain.example
```

Active role checks invalidate requests immediately, and the command removes staff sessions. Do not change AUTH_CODE_SECRET to recover a lost phone: that would make every stored authenticator key unreadable. This increment has no self-service MFA reset or recovery codes. Revoke the affected member, independently verify their identity, then use an authorised, audited database maintenance procedure to reset only that member's MFA fields before re-enrollment. Preserve an external operator/change record; do not invent approval or bypass identity checks.

Database runtime least privilege, staff recovery tooling, MFA key rotation, full operational alerts and backup/restore drills remain launch requirements. Never share authenticator keys, codes, private case JSON or database URLs in public issues/logs. Do not assume a screenshot of the local synthetic test studio proves that real staff sign-in or editorial approval happened on Railway.

## Finance desk

Grant `finance` to an intended verified staff account using `pnpm staff:manage grant <verified-email> finance`. The grant replaces the account's role list and invalidates existing staff sessions. Finance-only staff can use the finance desk after MFA and have no editorial access. Admins can use both workspaces.

The finance desk lists open refund requests and searches paid Paystack test orders by exact order ID or payment reference. If authorised to issue a refund, complete it in Paystack test mode. Enter the numeric Paystack refund ID against the matching order in the finance desk and select **Verify and reconcile refund**. A pending or failed provider status does not change the confirmed total. A fully refunded order closes its open request automatically. Use **Close request** with an audit reason when review is complete after a partial refund or when the request will not proceed. Avoid putting card or bank details in request or review notes.
