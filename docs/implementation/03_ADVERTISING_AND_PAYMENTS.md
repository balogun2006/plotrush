# 03 — Monetisation, advertising and payment operations

## 1. Commercial model

Revenue streams: (a) premium solo case purchases, (b) group-case host purchases, (c) directly sold ad placements and sponsorships, (d) approved Google inventory. Launch without subscriptions. Google and direct campaigns share placement capacity; they are not both billable for a single exposure. Report revenue by stream and currency; no automatic FX aggregation without a documented rate and date.

Free player journeys must remain useful when no ad can be served. Ads are optional monetisation capacity, not an assumption underlying access to basic evidence or daily completion. No cash/crypto/gift-card rewards for ad interactions, no paid score boosts and no encouragement to click ads to support the business.

## 2. Placement contract

| Placement key | Context | Initial behaviour |
|---|---|---|
| `solo_catalogue_card` | Free catalogue | One labelled native-style image/text card, no deceptive case styling |
| `solo_result_card` | After free solo reveal | Direct campaign first, eligible Google fallback; outside explanation controls |
| `solo_between_cases` | User chooses another free case | Optional approved Google full-screen ad at a natural transition |
| `solo_hint_reward` | Optional second hint request | Google rewarded only initially; never a direct banner pretending to be a rewarded video |
| `daily_sponsor_credit` | Free daily briefing/result | Clearly labelled advertisement, sponsor funding disclosure |
| `group_lobby_sponsor` | Free tutorial lobby only | Optional static direct sponsorship card; absent in paid room |

No third-party advertising in purchased sessions, active group investigations, voting, checkout, account, notes or admin. A sponsor-funded case has an explicit sponsor notice before entry; premium purchased versions remain unbranded unless separately sold and clearly described as branded. Sponsor copy never changes canonical evidence or grading.

Initial ad pressure limits: one display card per screen; full-screen at most one per completed free case and at least five minutes between; no full-screen ad before first free puzzle; rewarded offers at most two per solo attempt and no forced chaining. These are product caps, not a substitute for provider policy limits. In a result screen show one sponsor card rather than multiple overlapping units. Turn off Google Auto ads on gameplay routes to preserve intentional placement control.

## 3. Eligibility and direct campaign selection

API computes eligibility from authenticated session, placement/context, paid entitlement, content rating, campaign schedule, permitted country signal and consent. Never accept a claimed country or paid=false from the browser as authority. Use coarse country from trusted hosting metadata only where permitted; never persist precise location. Unknown country remains unknown. Allow contextual/nonpersonalised direct ads according to configured consent policy; do not load optional third-party tags before relevant consent.

Campaign status: `draft → creative_review → approved → awaiting_payment → scheduled → active → completed`, plus `paused`, `cancelled`, `rejected`. A campaign may only activate when approved creative revision exists, contract/order is approved, payment has cleared, schedule is live, budget/delivery cap remains and eligible placement is present. Webhook marks payment; it cannot bypass creative review. Edits to approved creative require a new revision and approval. Pause is immediate via a cached flag with TTL≤30s and authoritative eligibility checks on event acceptance.

Selection order: paid-session/no-ad → consent/context checks → exclusive booked sponsor if eligible → eligible direct placements sorted by priority and deterministic weighted rotation → approved Google fallback → nothing. No double booking of an exclusive date/placement/category; validate overlaps transactionally. An exclusivity deal suppresses all other third-party ads on the contracted screens during the period; Google category controls are not assumed to guarantee sponsor exclusivity.

Ad decision returns fixed creative revision, safe destination, label, decision ID and signed expiry token. Reserve a short-lived campaign delivery slot atomically under the cap before returning; expire unconsumed reservations after two minutes. Accepted qualifying impression converts reservation into a count. Reject duplicate/expired reservations; clicks may be recorded as nonbillable after expiry when redirect remains safe. Reservation limits stop many concurrent clients overrunning guaranteed delivery caps. Releasing expired reservations must be idempotent. Account for booking obligations separately from simple serving caps.

Frequency defaults: at most three impressions/campaign/principal/day and one per context screen. No persistent identity linking without appropriate permission. If durable frequency storage is disallowed, use permitted session-only controls and disclose lower precision in reporting; never claim verified unique humans.

## 4. Direct advertiser workflow

1. Advertiser enquiry form captures company, contact email, desired market, objective, approximate budget and dates. No public campaign activation.
2. Commercial owner qualifies the brand and checks destination, suitability and applicable advertising requirements in the target market.
3. Agree written booking: placement, dates/timezone, country/context, price/currency/tax, creative specs, exclusions, reporting, any impression commitment, treatment of underdelivery and cancellation, and content-production costs.
4. Admin creates advertiser and campaign draft. Finance raises a campaign order distinct from player product orders.
5. Advertiser uploads/sends creative; staff loads it through sanitised storage flow. Staff approves exact copy, image, destination and revision. Use `Ad`/`Advertisement` visibly; “supported by” alone is not a universal advertising label.
6. Receive payment via configured hosted provider or verified manual invoice settlement. Record receipt reference, actor and evidence for manual settlement; no public “mark paid” route.
7. Schedule eligible campaign; run a staff-only preview with clearly excluded test impressions.
8. Activate and check first real eligible delivery; monitor pacing, frequency and broken destinations.
9. Deliver report and close. If a contracted minimum is missed, apply the agreed make-good, extension or partial refund with advertiser consent; never invent impressions to satisfy a promise.

Start with fixed-period sponsorships with honest expected reach ranges and no guaranteed audience until reliable data exists. Later add impression bookings. Initial booking_type enum `fixed_period`, `impression_commitment`, `custom_content`. Quote custom creative production separately. CPC/CPA performance billing is out of beta scope because reliable attribution, dispute handling and fraud rules must come first.

## 5. Measurement and reporting

Separate `decision`, `rendered`, `qualifying_impression`, `click`, `reward_offer`, `reward_client_completed`, `redemption_reported`. Never bill a decision or an image download as a viewed impression. For first-party static display cards define an internal qualifying impression as ≥50% visible continuously for ≥1 second while the tab is foregrounded. Reset timer when hidden. This is an internal measurement rule, not third-party accreditation or proof of attention. State its limitations in contracts/reports.

Use IntersectionObserver and visibility events, short-lived signed decision tokens, server deduplication, reasonable elapsed-time checks and throttling. Browser claims remain forgeable; flag trust level and suspicious patterns. Exclude staff preview, automated tests and identified invalid/bot events. Do not silently remove contested events without a correction trail. Snapshot reports with a generated_at time and correction version. Do not claim a sponsored impression as delivered by Google.

Clicks flow through a signed, fixed-destination redirect; no user-controlled open redirect. Destination is stored server-side, HTTPS and approved at creative revision. Link includes allowed UTM parameters. Use safe external-link attributes. Coupon redemptions or advertiser conversion imports are `advertiser_reported`, deduplicated with documented source; not verified sales unless an authenticated integration establishes that. No sharing of player notes, answers, email or full session recordings with advertisers.

CSV columns: campaign ID/name, report period, country bucket, placement, creative revision, decisions, rendered, valid qualifying impressions, filtered events, clicks, CTR denominator, approximate unique browser identities, average frequency, delivery target, remaining commitment. For fixed-period deals do not invent a per-impression invoice amount. Google revenue is reconciled from actual provider reports; any in-app estimate is labelled estimate. Neither local callbacks nor ad requests determine Google payable revenue.

Daily sponsor pacing: target impressions / remaining eligible days, warn when delivery is more than 20% behind the plan; this is an operational alert, not a forecast guarantee. Prioritise user experience over increasing ad density to rescue an oversold campaign.

## 6. Google adapter and reward flow

Google H5 Games Ads is an application-based product and needs an approved AdSense account. Build adapters and labelled mocks first. Production flags default false until approval, valid publisher identifiers and consent are configured. Review official H5/Reward policies and current API during integration. Do not use ordinary display ads as a substitute for rewarded inventory.

Reward flow: server creates intent for this user's specific attempt/hint, one-time nonce, two-minute expiry, capped active intents → client requests a reward placement → when Google's `beforeReward` callback indicates availability show clear choice “Watch an ad to unlock hint 2” and “Continue without hint” → call supplied show function only after opt-in → on `adViewed`, submit intent completion → server checks ownership, nonce, expiry, supported hint and cap, grants once → on dismissed/no-fill/blocked/error, no false completed-ad event and no normal-play blockage. `adBreakDone` alone is not completion. Preserve game state during any ad and mute optional sound appropriately.

Important trust limit: this web callback is not a cryptographically verified server-to-server completion proof. Do not label it verified, don't assume mobile AdMob verification is available in H5, and don't grant purchases, cash, transferable rewards or group ownership from it. The maximum reward here is a low-value optional hint, with rate limits and replay protection; tolerate that a determined browser user can fake the callback. If stronger rewards are later needed, choose an actually supported server-verifiable provider flow and threat-model it first.

No-fill: explain “No ad available”; continue the case and keep free hint-after-wait route. The fallback becomes available 60 seconds after the current round's server-side unlock timestamp, including wall time while the tab is hidden. Label it “Free hint available in …”, never “active play time”. Do not show fake ads as real inventory. No retries looping ad requests indefinitely.

For UK/EEA personalised ads use an appropriate Google-certified TCF consent management integration. Configure the relevant regions/purposes, revocation and provider-recommended SDK behaviour. Keep the game functional with consent declined. A generic checkbox or privacy link is not a replacement for required provider consent signals. Review actual Nigerian privacy/advertising obligations and the operating entity with qualified advisers before selling live campaigns; this plan does not claim a licence exemption or give a regulatory opinion.

## 7. Player payments and entitlements

Use Paystack hosted checkout for NGN as the first adapter. Client sends product/price-version IDs, not payable amount. Server validates current product, currency, ownership and verified email, creates immutable order, then initialises provider with a unique attempt reference. Persist attempt mapping before a callback can be processed. Expired quote requires a new order; provider payments that succeed late are reconciled against the original amount and fulfilled once (or refunded if product cannot be supplied), not discarded because the 30-minute UI quote expired.

Webhook flow:

1. Read raw request bytes with capped payload size. Validate `x-paystack-signature` using HMAC-SHA512 and timing-safe comparison with the correct environment secret.
2. Persist valid event to durable inbox using provider/event/transaction/status dedup key. Acknowledge only after storage succeeds. Unrecognised valid event is acknowledged without granting value. Signature failure is rejected.
3. Synchronously attempt bounded processing after inbox persistence; pending jobs retry safely. Essential work must not depend on a detached promise surviving request completion.
4. Server verify the stored reference; require successful transaction, expected provider environment, reference, integer amount, currency and correct order mapping. Browser metadata and a top-level API `status:true` are insufficient.
5. Transactionally lock order/payment, record successful payment, grant exactly one entitlement or mark campaign payment cleared, emit event and receipt-outbox item. Duplicate callback and webhook converge on this function.
6. Show paid order and ownership on a fresh fetch. Receipt delivery failure does not revoke successful access; retry separately.

Provider references and transaction IDs unique per provider. Mismatched amounts/currency go to finance exception queue and do not unlock. Missing webhook is recovered from verification/reconciliation. Never store full card authorisation data or PAN; retain only necessary transaction references and safe metadata.

Suggested local states: order `created/pending/paid/cancelled/expired/refund_pending/refunded/disputed`; payment attempt `initialising/pending/succeeded/failed/reversed`; entitlement `active/suspended/revoked`. State is not a simple ordinal: late provider success can fulfil an expired order; reversal/refund adjusts ownership through a separate audited operation. Dispute notice suspends future premium starts while reviewed; an already active group session can finish unless fraud/content risk requires otherwise. Clearly distinguish refund requested from provider-confirmed refund.

Refund policy implementation: expose request form tied to order, staff reason, provider refund request and later confirmed outcome. Completed full refund revokes future access; retain result history, and do not delete evidence of payment. Multiple partial refunds cannot exceed payment. Reinstatement/regrant requires audit reason and role. Duplicate purchases already owning product create a finance task and do not silently extend a meaningless licence. Policy copy must reflect business decisions and applicable consumer rights; blanket “no refunds” is not a launch default.

## 8. Admin minimum capabilities

Finance: search order/reference, inspect verified state and provider exceptions, request/reconcile refund, export revenue by currency. Ad manager: advertisers, campaign calendar, conflict detection, typed creative upload/approval, targeting, frequency, caps, preview, activation/pause and CSV. Publisher: content approvals and daily release. Admin: role management and emergency disable flags. Every change records actor, time, old/new status and reason where sensitive. Viewing an admin page is not permission to mutate every object.

Campaign killswitch must suppress direct decisions without redeploy; Google killswitch prevents new requests and script loading. Payment killswitch prevents new checkout but leaves webhook processing, verification, receipts and refunds operational. Do not turn off the ability to honour already completed payments during an outage.

## 9. Financial dashboard

Daily: player gross receipts, refunds, processor charges, net collected, recognised content sales, campaign bookings, campaign cash received, campaign delivery obligations, Google estimated/finalised revenue, content/hosting/support/acquisition costs. Distinguish prepaid campaign cash from delivered advertising revenue. Track profitability only after all material expenses; a high ad CPM is not automatically high profit. Reconcile provider totals to local orders daily, retain exception queue until resolved and report chargebacks separately.

## 10. Discovery context in advertising (v1.1)

Campaigns may optionally target current validated catalogue theme context using chapter07 context_theme_ids; saved interests are not an advertising audience. Do not sell fiction themes as verified personal traits. Recommendation ranking excludes sponsorship price and ad revenue. Any promotion is separately labelled and subject to existing free/paid restrictions, consent, budgets and deduplication. A filter change recomputes context and invalidates an old unrendered decision; it does not create additional billable impressions from the same card exposure.
