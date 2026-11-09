# PlotRush

**Every clue changes everything.**

PlotRush is a mobile-first mystery game platform: solve a case alone, return for a free daily puzzle, or bring friends into a shared investigation.

## Project status

**Playable draft preview.** Free solo and 2–6 player group tutorials, themed discovery, private notes/interests, verified-email account foundations and server-priced orders are implemented. Paystack sandbox checkout, signed webhook inbox, reconciliation and optional receipt delivery are integrated behind disabled flags. Real provider credentials and test transactions are still required. A protected editorial studio now supports draft authoring, independent review, immutable releases and a UTC calendar behind a disabled publication switch. Premium solo and group gameplay is available in the test harness behind a disabled staging switch. Live billing, ads and approved launch content remain outstanding. [Try staging](https://plotrush-web-staging.up.railway.app/) and see [implementation status](docs/implementation-status.md).

## Planned experience

- **Play solo — free:** complete introductory and daily mysteries without email, payment or invitations.
- **Play with friends:** one host purchases a case; guests join through a browser link and receive different clues.
- **Find your kind of mystery:** browse themes such as Thriller, Cold Case, Wedding & Family, Heist and Supernatural, with mood/difficulty/duration/mode/access filters.
- **Make it yours:** optional saved interests and deterministic recommendations; onboarding can be skipped.
- **Premium cases:** longer solo cases and host-funded group experiences with ad-free purchased sessions.
- **Sustainable monetisation:** direct sponsorships and advertising, plus Google inventory when approved; free gameplay remains available when ads cannot load.

Themes describe intended catalogue coverage. The supplied drafts populate Everyday Mystery and Wedding & Family only; additional reviewed content is needed for other shelves.

## Start here

1. Read [AGENTS.md](AGENTS.md) for implementation instructions and current boundaries.
2. Read the [implementation handoff](docs/implementation/README.md), currently **v1.1**.
3. Follow the [31-task implementation backlog](docs/implementation/06_AGENT_BACKLOG_AND_ACCEPTANCE.md) and [theme/discovery specification](docs/implementation/07_THEMES_DISCOVERY_AND_RECOMMENDATIONS.md).
4. Check the [roadmap](ROADMAP.md) and [implementation status](docs/implementation-status.md).

| Specification                                                                     | Contents                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Product and delivery](docs/implementation/01_PRODUCT_AND_DELIVERY_PLAN.md)       | User journeys, screens, ownership, pricing hypotheses and release stages |
| [Engineering](docs/implementation/02_ENGINEERING_SPEC.md)                         | Database, access controls, game state, APIs and provider interfaces      |
| [Advertising and payments](docs/implementation/03_ADVERTISING_AND_PAYMENTS.md)    | Direct campaigns, Google ads, checkout, verification and refunds         |
| [Content](docs/implementation/04_CONTENT_AND_STARTER_CASES.md)                    | Editorial process, story logic, versioning and launch supply             |
| [Testing and deployment](docs/implementation/05_TESTING_DEPLOYMENT_OPERATIONS.md) | Environments, tests, CI/CD, launch gates, monitoring and recovery        |
| [Discovery](docs/implementation/07_THEMES_DISCOVERY_AND_RECOMMENDATIONS.md)       | Theme taxonomy, filters, interests and recommendations                   |

## Proposed technical stack

TypeScript · Next.js App Router · React · CSS · Railway PostgreSQL/hosting · pg · Zod · Vitest · Playwright. [ADR 001](docs/ADR-001-RAILWAY.md) documents the owner-approved hosting change and guest-auth limitations. Paystack sandbox configuration is documented in [Railway variables](docs/RAILWAY-VARIABLES.md).

## Validate the supplied fixtures

The starter fixtures include a Python structural check requiring Python3:

```bash
python3 docs/implementation/validate_starter_cases.py
```

It checks five case drafts, clue/answer references, group distribution and discovery metadata. It does not run a game, prove story fairness or replace blind playtesting. Application checks and commands are below.

## Content and configuration

- [Starter case drafts](docs/implementation/starter_cases.json) include solutions and are public development examples. Do not use these public fixtures as secret production answers or bundle real solutions into a client build. Production cases belong behind the authorised content API.
- [Discovery taxonomy](docs/implementation/discovery_taxonomy.json) defines initial themes/moods/difficulties.
- [.env.example](.env.example) contains placeholders only. Keep real credentials and private production content out of git.
- [Design brief](docs/DESIGN_BRIEF.md) records the approved visual direction and additional screens to build.

## Delivery principles

Build and test real database-backed solo and multi-browser group flows before claiming a release. Verify payments on the server, preserve private clues/votes, keep recommendations separate from paid placements, and never fabricate players, ad results, test outcomes or provider approvals. Staging precedes production; live monetisation stays disabled until configured and verified.

## Run the application

Requires Node24 and pnpm11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

No credentials are needed locally: PostgreSQL runs embedded in `.plotrush/postgres` using PGlite. Railway uses a real PostgreSQL service instead. Local guest progress is disposable; never deploy the embedded adapter as a production database. `.env.example` documents the preview variables.

```bash
pnpm content:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E tests serve the compiled production build against a disposable PGlite TCP server through the same pg driver used on Railway. Run build first. `TEST_BASE_URL` targets a separately deployed preview; `TEST_CHROME_PATH` optionally selects an installed Chromium executable when browser downloads are unavailable.

[Railway deployment instructions](docs/RAILWAY-DEPLOYMENT.md) include environment variables, verification and recovery requirements.

## Free group tutorial

Open `/rooms` to create or join The Missing Microphone. Use separate browser profiles/devices for different players; tabs in the same browser share a seat. Everyone readies up, the host starts, players share private evidence and vote for a joint reveal. Keep your browser session to reconnect. [ADR002](docs/ADR-002-GROUP-PREVIEW.md) documents persistence, timers and remaining multiplayer scope.

## Account and order foundations

`/account` supports email-code verification and preserving guest progress when real delivery is configured. Local development displays a labelled test code without sending email. Existing accounts require explicit progress-merge confirmation. On Railway with placeholders, email recovery stays unavailable and free games remain usable.

`/shop` contains a local-only development payment laboratory. Deployed previews show premium cases in preparation until explicit Paystack sandbox switches and credentials are configured. Keys alone do not enable checkout. [ADR003](docs/ADR-003-ACCOUNTS-COMMERCE.md) records account/order foundations; [ADR004](docs/ADR-004-PAYSTACK.md) extends them with sandbox payments. Run `pnpm api:generate` / `pnpm api:check` for the account/order API contract.

## Paystack sandbox integration

[Railway variables and activation steps](docs/RAILWAY-VARIABLES.md) list the exact keys, feature switches, webhook URL and private cron worker settings. [ADR004](docs/ADR-004-PAYSTACK.md) explains durable verification and remaining release gates. Hosted checkout needs no public key. Never enable live billing for the public draft cases.

## Editorial studio

`/admin` requires an operator-granted verified account and authenticator verification. There is no default administrator. [Staff setup](docs/STAFF-SETUP.md) explains provisioning and the publication switch; [ADR005](docs/ADR-005-EDITORIAL.md) records immutable versions, preview isolation and remaining scope. Calendar scheduling is editorial only; public daily selection and streaks remain forthcoming.
