# PlotRush

**Every clue changes everything.**

PlotRush is a mobile-first mystery game platform: solve a case alone, return for a free daily puzzle, or bring friends into a shared investigation.

## Project status

**Planning and implementation handoff. Application development has not started in this repository.** There is no deployed game, configured production database, live checkout or advertising integration yet. The checked-in materials define what to build and how to validate/deploy it.

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

| Specification | Contents |
|---|---|
| [Product and delivery](docs/implementation/01_PRODUCT_AND_DELIVERY_PLAN.md) | User journeys, screens, ownership, pricing hypotheses and release stages |
| [Engineering](docs/implementation/02_ENGINEERING_SPEC.md) | Database, access controls, game state, APIs and provider interfaces |
| [Advertising and payments](docs/implementation/03_ADVERTISING_AND_PAYMENTS.md) | Direct campaigns, Google ads, checkout, verification and refunds |
| [Content](docs/implementation/04_CONTENT_AND_STARTER_CASES.md) | Editorial process, story logic, versioning and launch supply |
| [Testing and deployment](docs/implementation/05_TESTING_DEPLOYMENT_OPERATIONS.md) | Environments, tests, CI/CD, launch gates, monitoring and recovery |
| [Discovery](docs/implementation/07_THEMES_DISCOVERY_AND_RECOMMENDATIONS.md) | Theme taxonomy, filters, interests and recommendations |

## Proposed technical stack

TypeScript · Next.js App Router · React · Tailwind · Supabase Postgres/Auth/Storage/Realtime · Vercel · Paystack for initial NGN checkout. These are implementation defaults, not installed or provisioned services. Supported dependency versions must be checked and pinned when scaffolding the app.

## Validate the supplied fixtures

The repository currently includes a Python-only structural check requiring Python3 and no external packages:

```bash
python3 docs/implementation/validate_starter_cases.py
```

It checks five case drafts, clue/answer references, group distribution and discovery metadata. It does not run a game, prove story fairness or replace blind playtesting. The handoff's `pnpm` commands describe scripts the implementing agent must create; they do not exist yet.

## Content and configuration

- [Starter case drafts](docs/implementation/starter_cases.json) include solutions and are public development examples. Do not use these public fixtures as secret production answers or bundle real solutions into a client build. Production cases belong behind the authorised content API.
- [Discovery taxonomy](docs/implementation/discovery_taxonomy.json) defines initial themes/moods/difficulties.
- [.env.example](.env.example) contains placeholders only. Keep real credentials and private production content out of git.
- [Design brief](docs/DESIGN_BRIEF.md) records the approved visual direction and additional screens to build.

## Delivery principles

Build and test real database-backed solo and multi-browser group flows before claiming a release. Verify payments on the server, preserve private clues/votes, keep recommendations separate from paid placements, and never fabricate players, ad results, test outcomes or provider approvals. Staging precedes production; live monetisation stays disabled until configured and verified.
