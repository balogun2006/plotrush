# Sources, decisions and unresolved dependencies

Checked 5 November 2026. External specifications and platform availability can change; recheck relevant official docs when implementing each adapter. Most of this package describes our own product requirements, not external vendor guarantees.

## Official technical sources

- Next.js installation/App Router: https://nextjs.org/docs/app/getting-started/installation — choose supported runtime/dependencies and pin exact versions during implementation.
- Node supported releases: https://nodejs.org/en/about/previous-releases — Node24 is the reference baseline, recheck support at deployment time.
- Supabase anonymous identity: https://supabase.com/docs/guides/auth/auth-anonymous — anonymous identities can later link verified accounts; they need appropriate authenticated-role permissions and dynamic personalised rendering.
- Supabase private Realtime: https://supabase.com/docs/guides/realtime/authorization — private channel configuration and membership authorisation must be implemented; realtime is not an authorisation bypass.
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/ — verify raw payload signature using correct environment secret.
- Paystack verification: https://paystack.com/docs/payments/verify-payments/ — verify from server and prevent duplicate fulfilment.
- Paystack transaction API: https://paystack.com/docs/api/transaction/ — initialise and verify stored references using provider contract.
- Vercel deployment: https://vercel.com/docs/deployments
- Vercel scheduler limitations: https://vercel.com/docs/cron-jobs/usage-and-pricing — check actual tier, frequency and timing; no room correctness dependency on precise execution.
- Google H5 signup: https://support.google.com/adsense/answer/1705831 — application and account approval dependencies.
- Google H5 guidance: https://support.google.com/adsense/answer/9959170 — supported game formats and placement guidance.
- Google Ad Placement API: https://developers.google.com/ad-placement/apis — optional placement requests, `beforeReward`, `adViewed`, `adDismissed`, `adBreakDone` callbacks; do not assume a request produces an ad.
- Google rewarded policies: https://support.google.com/adsense/answer/9121589 — reward disclosure, user choice and allowed reward requirements.
- Google coexistence: https://support.google.com/adsense/answer/9728 — direct/non-Google advertising can coexist subject to applicable policies.
- Google regional consent: https://support.google.com/adsense/answer/13554116 — certified CMP/TCF requirements for personalised advertising in relevant regions.
- UK advertising recognition: https://www.asa.org.uk/advice-online/recognising-marketing-communications-overview.html — clearly identifiable marketing.

## Internal reference artifacts

- Design direction: [design brief](../DESIGN_BRIEF.md).
- Earlier desk research informed this plan; independent playtesting and market validation remain outstanding.

The earlier report's group-first recommendation is expanded here by the user's explicit solo/free/direct-ad decisions. No interviews, ad experiments or provider approvals were performed while writing this handoff. Seed stories were structurally checked, not independently playtested.

## Assumption register

| Assumption/default | Consequence | How to validate/change |
|---|---|---|
| PlotRush working name | No domain/trademark clearance implied | Owner selects/clears final brand before public promotion |
| Adult pilot, English | Limits audience/content scope | Review audience and applicable requirements before expansion |
| NGN payments first | GBP purchase not automatically supported | Activate supported provider/currency before selling GBP products |
| Supabase/Vercel reference stack | Accounts, quotas and commercial plan required | Existing deployment environment can substitute while preserving contracts |
| ₦1,500 solo, ₦5,000 group | Pricing is unvalidated | Cohort experiments with immutable quotes |
| 4–6 premium group | May create gathering friction | Measure assembly; lower count only with editorial distribution validation |
| Two optional hints/round | Hints affect experience | Blind tests; change versioned content, preserve first results |
| Client-reported web reward | Susceptible to browser forgery | Only low-value hints; no money/ownership grants |
| Internal ad visibility rule | Not independently audited | Disclose limitations; choose audited measurement if contracts require it |
| Service budget £100–£300/month | Reserve may not fit real usage | Obtain actual plan quotes and usage estimates |
| 7–10 week build estimate | Scope/provider approvals can shift date | Track milestone evidence rather than calendar promises |
| Daily queue14 +2 premium | Content labour required beyond supplied seeds | Assign editor, author remaining drafts and blind-test |

## External launch dependencies

Record owner, status, last checked and evidence for: merchant activation; domain/DNS; hosting/database plan; verified SMTP sender; consent integration; live Google/H5 approval; approved sponsor booking/payment; business terms/refund/privacy review for actual markets; content/art licences; editorial approvals and blind tests; incident/support contact. Disabled modules must state disabled status and have a functioning alternative path. Do not fabricate credentials, registrations, legal conclusions, commercial agreements or approval evidence.

## Version1.1 discovery decisions

Theme taxonomy, filter semantics, ranking weights and launch shelf thresholds are internal product decisions, not researched market standards. The new scope implements the user’s explicit theme-selection request. No external provider fact changed in this update. Recommended launch themes require further authored/reviewed content; current seeds do not populate Cold Case or Thriller. Update release estimates after integrating tasks025–031; the previous estimate remains provisional.
