# PlotRush: implementation-to-deployment handoff

Version 1.1 · 5 November 2026 · Working product name, not trademark-cleared.

This package specifies the product requested in this conversation: attractive mobile browser mysteries, free solo play, paid solo/group cases, Google advertising and directly sold advertising/sponsorships. It is a plan and content seed, not an implemented or deployed application.

## Read in this order

1. `01_PRODUCT_AND_DELIVERY_PLAN.md` — decisions, screens, business model and staged delivery.
2. `02_ENGINEERING_SPEC.md` — architecture, database, permissions, state machines and HTTP contracts.
3. `03_ADVERTISING_AND_PAYMENTS.md` — purchases, direct campaigns, Google adapters, measurement and failure handling.
4. `04_CONTENT_AND_STARTER_CASES.md` and `starter_cases.json` — playable authored seeds, distribution, scoring and editorial requirements. These contain spoilers.
5. `05_TESTING_DEPLOYMENT_OPERATIONS.md` — environments, CI/CD, launch checks, rollback and runbooks.
6. `06_AGENT_BACKLOG_AND_ACCEPTANCE.md` — ordered implementation tickets and completion evidence.
7. `.env.example` — configuration contract; placeholder values only.
8. `07_THEMES_DISCOVERY_AND_RECOMMENDATIONS.md` and `discovery_taxonomy.json` — mandatory theme browsing, filters, private interests and recommendation contracts.
9. `CHANGELOG.md` — v1.1 changes and migration notes.
10. `SOURCES_AND_ASSUMPTIONS.md` — official documentation checked and remaining external dependencies.

The engineering choices are recommended defaults. Proceed with implementation using them unless an existing repository or hosting environment provides a reason to adapt; record changes in an architecture decision record. Do not silently remove capabilities from this package to fit a UI-only demo.

## Design reference

Approved design direction: six mobile screens, midnight purple, ivory cards, lime actions and a cinematic Nigerian wedding setting. See [design brief](../DESIGN_BRIEF.md).

Earlier research informed the product hypothesis; this repository does not include customer-validated demand or measured acquisition results.

The current plan supersedes the earlier group-only scope. Free solo is a primary entry point. Direct ad management is included. Version1.1 adds theme browsing, catalogue filters, optional interests, deterministic recommendations, taxonomy administration and new release gates. The original six-screen image is a style reference, not a complete map of these new screens. Prices, timings, budgets and conversion targets remain test assumptions.

## Immediate instruction to the implementing agent

Inspect the chosen workspace/repository and its instructions, create a clean branch, read this package, and implement tickets MN-001 onward, inserting MN-025–031 at the dependency points specified in chapter07 rather than after deployment. Deliver a real database-backed vertical slice before polishing the entire catalogue. Preserve the mockup's visual character, but use accessible production components. Implement fake payment and ad providers for development; never fabricate live payments, ad impressions or advertiser results. Keep paid checkout, live third-party ads and public acquisition behind independently controlled release flags until configured and tested. Use the deployment process appropriate to the user's selected environment; the reference stack here is Vercel plus Supabase, not a requirement to migrate an existing host.

Prepare a staging deployment and operational evidence. Production requires real provider accounts/credentials, domain configuration and editorially approved content; mark unavailable items clearly and continue every independent task. Ask only for inputs actually needed to proceed with the blocked external step. The current user requested a plan, so this package itself does not represent authorisation to buy subscriptions, contact advertisers or start accepting payments.
