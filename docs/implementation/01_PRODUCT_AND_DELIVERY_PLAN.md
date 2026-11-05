# 01 — Product and delivery plan

## 1. Outcome and product promise

Build a mobile-first browser game where a person can immediately solve an original fictional mystery alone, return for a daily case, or host a case for friends. Earn through paid experiences, optional rewarded advertising, appropriate programmatic placements and directly sold advertiser campaigns. The core promise is: “A mystery worth solving. Alone or with your group chat.”

Success means people finish cases, return, pay for further experiences and invite new hosts. Virality and profitability are hypotheses, not promised launch outcomes. Do not depend on advertising to fund unlimited acquisition before measuring revenue per retained player.

Launch cohort: English-speaking adults, initially Nigerian residents and UK-based African diaspora participants. Pilot is 18+ as an operating scope decision, even though starter cases contain no graphic violence. Do not market to children. Adult-only positioning does not by itself establish a legal exemption or Google approval. Localise currency and spelling, but no translated versions initially.

## 2. Decisions the agent should implement

| Area | Decision |
|---|---|
| Delivery | Responsive web application; installable shell optional after core launch |
| Solo access | No email required for the free introduction or daily case |
| Group access | Guests enter a nickname; no email or individual payment required |
| Host ownership | Verified email account required before purchase; free tutorial host can remain anonymous |
| First page | Two prominent actions: “Play solo — free” and “Play with friends” |
| Content | Authored, deterministic puzzles; no live AI writing the solution |
| Discovery | Multi-theme browsing plus mood/difficulty/duration/mode/access filters; chapter07 governs |
| Interests | Optional anonymous/permanent saved interests, skip/edit/clear supported |
| Recommendations | Deterministic private ranking; editorial fallback; no live AI or paid placement in organic results |
| Free daily | One complete selected mini-case each UTC day; replay allowed, first result counts |
| Premium solo | Individual longer case; paid session contains no third-party ads |
| Premium group | Host buys a case, guests included, 4–6 players initially |
| Tutorial group | Separate short tutorial, 2–6 players, always free |
| Ownership | A solo purchase covers that solo case; a group purchase covers hosting that group case; neither is a subscription |
| Replay | Purchased case can be replayed while the service operates; disclose that puzzles do not change and replay is unranked |
| Hosting limit | One active room per host per case; 10 new rooms/host/day as initial abuse control |
| Ads | Free solo catalogue/results, optional solo hints; no ads inside active paid group sessions |
| Direct sponsorship | Manually sold and administered at launch; no advertiser self-service portal |
| Cash rewards | None: no betting, cash-out, prize pools or transferable ad rewards |
| Communication | Real-world discussion or users' own calls; structured clue sharing and short notes in product; no voice/video stack |
| Production market | NGN checkout first; UK free play available; GBP checkout only after a separately configured supported provider |

The UK price display must not imply GBP payment support exists. If no GBP provider is live, hide GBP buy buttons and either clearly offer NGN checkout with possible bank FX charges or disable UK purchases using a configuration rule. Do not assume a Nigerian Paystack account accepts GBP settlement.

## 3. Release stages

### R0 — Design and local functional prototype

Deliver a responsive catalogue with theme cards and filter UI, free solo tutorial, paid-case preview, lobby, evidence cards, group board, voting and reveal screens. Use seeded data and mock adapters. A labelled demo mode may simulate guests for previews, but never present simulated guests as a live multiplayer test.

Exit: a tester can finish one solo case; four separate authenticated browser contexts can complete a group case against a local database. Preserve independent private evidence and hidden votes.

### R1 — Private alpha with real persistence

Deliver taxonomy metadata, URL-driven filters, optional interests, deterministic recommendations, anonymous identity, verified-email upgrade, transactional game engine, reconnect, basic editorial import/publish tools, analytics and administrative campaign management with test creatives. Payments remain in provider test mode. No real Google ads. Include free solo, a distinct free group tutorial and the full wedding case.

Exit: security/concurrency tests pass; ten groups blind-play the wedding case; content editor corrects unfair clues; refunds and payment replays pass in test mode. This is the first version suitable for invited pilot users.

### R2 — Revenue-ready public beta

Enable verified real checkout after provider setup, approved content catalogue and operational checks. Support direct paid campaigns with approved creatives and honest first-party reporting. Google code remains disabled until account/product approval and consent configuration are complete. Free play must function if ads are unavailable.

Exit: paid entitlements survive refresh/device change, external providers are verifiably live, support/refund contact is operational, one live low-value transaction and refund are reconciled if authorised, advertiser reporting works without invented traffic.

### R3 — Retention and advertising expansion

Enable approved H5 rewarded hints and post-case breaks; add creator attribution, multi-case bundles and advertiser exports. Introduce membership, native apps, custom branded games and asynchronous multiplayer only if cohort data supports them. These are later backlog, not public-beta requirements.

## 4. Complete user journeys

### A. First solo play

Open home → choose solo → see case length/content note → start anonymously → see a clear briefing → examine round-one clues → continue through remaining rounds → choose suspect and decisive evidence → submit → receive explanation → share spoiler-free result or play the next available case. First result is immutable; replay is clearly marked. No invitation, purchase or ad required to reach the end.

### B. Daily return

Daily card shows today's release and countdown to next release in local time. Selection is stored by UTC date and doesn't depend on a cron job firing exactly on time. “Your first attempt today” counts towards streaks; a completed attempt on consecutive UTC dates extends the streak. Skipping a date resets it. Show the UTC reset rule. Player returning during an unfinished attempt can resume its frozen version after the date changes; that completion counts against the attempt's original date. Maintain browser-only progress until the player upgrades their account.

### C. Solo player gets stuck

Every round has one free general hint. A second contextual hint may be obtained from an optional rewarded ad when enabled and available. If declined or no ad is available, the player can continue without it; for the beta also offer a free second hint after 60 seconds elapsed since the round unlocked, measured by server time. No answer-critical evidence is hidden behind ads. Hint use appears in personal results but does not reduce accuracy points. Do not impose a countdown that pressures ad viewing.

### D. Purchase

Show product, mode, total price/currency, inclusions and refund/support information → verified email → server creates immutable order → hosted provider checkout → server verification → account entitlement → start or resume. A return URL alone never unlocks content. Pending verification shows “Checking your payment” with safe retry and support reference. Duplicate payments produce a support/refund item rather than extra silent charges or duplicate ownership.

### E. Host friends

Select group case → see “One host pays; friends join free” → confirm ownership/purchase → create lobby → nickname → invite link/code → guests join and mark ready → minimum roster ready → start → case version and roster freeze → three rounds of distributed evidence → private votes → joint reveal. The host has no access to the solution or other players' private clues through hosting privileges.

### F. Guest

Open invite → briefing, approximate duration and capacity → nickname → anonymous identity → join room → ready → receive allocated evidence. Existing room full/started/expired states have explicit recovery actions. No forced marketing sign-up. A guest may save progress by upgrading later. No invite-code-only impersonation.

### G. Advertiser

Open “Advertise with us” → review actual audience stats when available, formats and enquiry form → staff manually agrees campaign scope and price → staff records contract/order → advertiser supplies creative → staff reviews and approves → finance marks cleared payment → campaign runs → advertiser receives scheduled CSV/report. Do not automate outreach or claim an audience that has not been measured.

## 5. Screen and route inventory

| Route | Required content and actions |
|---|---|
| `/` | Hero, both play modes, illustrated theme cards, For you/Featured rail, daily case, clear free/premium labels |
| `/themes`, `/themes/[slug]` | Available themes, description, counts, filtered cases and explicit empty/retired states |
| `/explore` | Shareable filters: themes, mood, difficulty, mode-specific duration, mode, free/premium, sort |
| `/interests`, `/account/interests` | Optional multi-select interests, skip/save/edit/clear and personalisation toggle |
| `/solo` | Daily and introductory cases, premium catalogue, durations, completed markers |
| `/cases/[slug]` | Spoiler-free synopsis, mode selector, player count, price, content note, ownership |
| `/play/[attemptId]` | Briefing, round navigation, evidence, notes, hints, accusation, autosave |
| `/play/[attemptId]/result` | Verdict, evidence-backed explanation, accuracy, elapsed time, replay, sharing |
| `/host/[slug]` | Purchase/ownership then create lobby |
| `/join/[code]` | Nickname, rules, membership and capacity errors |
| `/rooms/[roomId]` | Lobby or active game; private evidence/group board/notes; network state |
| `/rooms/[roomId]/result` | Joint reveal, group verdict and individual vote after close |
| `/checkout/[orderId]` | Read-only order and payment continuation/verification |
| `/account` | Upgrade/sign-in, owned cases, purchases, history, delete/export request |
| `/advertise` | Formats, enquiry form, honest media kit and contact |
| `/admin` | Permission-based editor, campaign, finance and support tools |
| `/privacy`, `/terms`, `/refunds`, `/contact` | Actual operating entity, policies, support and rights contacts |

Use the approved mockup's dark purple `#211B35`, lime `#D9F36A`, warm ivory and restrained coral. Minimum touch targets 44px, readable 16px body, visible focus, keyboard support, contrast-tested text, reduced-motion preference, caption/transcript for every audio clue. Mobile-first 360px through desktop. Decorative assets may load later; clues must remain readable without images. No puzzle should require colour perception alone.

Group board shows only clues explicitly shared or promoted by the disconnect policy. Sharing is irreversible within that session and labelled as such. Result cards contain title, elapsed time and performance only, never culprit or decisive clue. Public social previews use static spoiler-free art, not private game-page screenshots.

## 6. Initial products and pricing

Configuration defaults for a test cohort, not validated prices:

- Solo tutorial, daily cases and group tutorial: free.
- Wedding solo: ₦1,500, product `wedding-solo-v1`.
- Wedding hosting: ₦5,000, product `wedding-group-v1`.
- A future bundle must list exact included products, entitlement scope and discount.

Amounts stored in minor units: 150000 and 500000 kobo. Do not store floating currency. Purchases remove all third-party promotional placements from the purchased session, including direct sponsor cards. The free catalogue may still display labelled ads; communicate “Ad-free purchased cases”, not an unrestricted “No ads anywhere”. Do not insert branded content retrospectively into purchased case versions.

Launch without recurring billing. Account-wide ad removal and membership require a separate product definition and cancellation/renewal implementation before being sold. Prices are versioned; a checkout retains its quoted price for 30 minutes. Changing a price does not alter existing orders or ownership.

## 7. Content supply and retention

An engineering launch can use the included seeds. An advertised daily product needs an approved queue of at least 14 distinct mini-cases and two premium cases before broad acquisition. Agent may author additional drafts, but flag them as drafts until editorial review and blind testing. Never label a repeated case “new”. At least five of the fourteen should have completed independent blind playtests; every case needs editorial logic and sensitivity review.

Daily pipeline: brief → canonical timeline/solution → clues and alternatives → structured JSON validation → editorial review → blind playtest → revise → approve immutable version → schedule. A named content owner must own weekly replenishment. Warn admins when fewer than seven scheduled cases remain. If the queue runs out, offer a clearly labelled archive pick without awarding a new daily streak for a previously completed case; do not publish broken content automatically.

## 8. Analytics and experiment definitions

Server-authoritative events: attempt started/completed, room created/joined/assembled/started/completed, order paid/refunded, entitlement granted, campaign activated. Client events: page viewed, evidence opened, share sheet opened, optional ad offered/viewed, notes engagement. Mark source and trust tier. A share button tap is not a proven delivered invitation; ad callback is not proof of a financial outcome.

Report cohorts separately for Nigeria, UK and unknown, source, anonymous/account, solo/group and free/paid. First-touch attribution is stored pseudonymously for 30 days only where permitted; invite attribution records room guest-to-new-host flow and avoids double-counting the same identity. Cross-device identity only after account linking; anonymous IDs are not guaranteed unique humans.

Definitions: assembled room = minimum number ready; completed solo = immutable accusation submitted and result created; completed group = reveal persisted; paying customer = distinct verified account with a non-refunded paid order; repeat buyer = another distinct case purchase, not replay of the same product; referral host = prior guest who creates and starts a different room within 30 days.

Initial decision gates, not benchmarks: solo completion ≥70%; day-7 solo return ≥15% of eligible first-day starters; group assembly ≥60%; group completion ≥70% of started rooms; premium purchase ≥15% of qualified completed group tutorial hosts; 30-day repeat premium purchase ≥20% of buyers offered a different case; positive contribution per acquired payer. Observe full windows, report numerators, exclude staff/test traffic. Do not pool countries to hide poor results. No automated growth spend based on tiny samples.

## 9. Delivery estimate and resources

Reference estimate for one experienced full-stack engineer/agent with active editorial support: 7–10 weeks to a revenue-ready beta, excluding provider approval delays. This is an estimate, not a guarantee or outsourced development quote. Weeks 1–2 foundation/solo; 3–4 group engine/reconnect; 5 payments/editorial; 6 direct ads/reporting; 7–8 test/staging/pilot; 9–10 contingency and approved Google integration. Tickets and exit gates take precedence over dates.

Roles: owner approves business identity/pricing/contracts; engineer builds and operates; editor reviews puzzle logic and creates pipeline; designer checks production screens; commercial owner sells and reports sponsorships. One person may perform several roles but responsibilities remain explicit.

Budget working envelope: £100–£300/month hosted services for early pilot plus content, creative assets, provider fees, taxes and people. This is a reserve, not current provider pricing. Check paid commercial plan suitability, realtime, auth and backup quotas before provision. Cap optional acquisition initially at £500–£1,500 excluding labour; release in small experiments only after completion works. Maintain a cost dashboard and alerts at 50/80/100% of agreed spend limit; don't let viral free traffic create an uncontrolled bill.

## 10. Boundaries

Not initial scope: native stores, live voice/video, real-money gaming, public stranger matchmaking/chat, dynamic AI interrogation, free-form user-generated cases, auction ad exchange, self-service advertisers, unrestricted individual behavioural targeting or recurring subscriptions. Build clear provider interfaces and permissions so later features can be added without weakening the launch implementation.

## 11. Theme discovery expansion (v1.1)

Chapter07 is required implementation scope. A case supports multiple themes; mood/difficulty/duration remain separate. Do not infer Cold Case from ordinary contemporary theft. Launch goal is three promoted shelves—Thriller, Cold Case, Wedding & Family—with at least three distinct eligible cases and one free solo option each. Existing fourteen-daily/two-premium content gate also applies. Alpha can launch populated shelves only. Supplied seeds populate Everyday Mystery and Wedding & Family; further content must be authored/reviewed. New tasks MN-025–031 integrate before relevant R1/R2 gates. Re-estimate discovery work within release contingency; original7–10-week estimate is not a fixed commitment.
