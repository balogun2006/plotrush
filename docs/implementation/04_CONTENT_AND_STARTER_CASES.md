# 04 — Content production and starter mysteries

## Included content

`starter_cases.json` contains five complete authored drafts: three mini solo cases (The Last Slice, The Wrong Parcel, The Playlist Switch), one distinct group tutorial (The Missing Microphone), and the three-round premium case The Missing Wedding Gift. Wedding supports both solo and 4–6-person group play. Drafts include briefing, suspects, reason choices, clues, hints, canonical answer and elimination explanations. They are implementation seeds, not proof of independent playtest quality.

Do not run JSON imports into public/static bundles. Store canonical JSON and solutions in protected storage/database. Import validates and creates draft case versions; publication requires an editor/publisher action. Build the importer to accept this exact format, or provide a documented migration and validated transformed fixture. Include schema JSON in the repository and generate TypeScript types from it.

## Format and validation

Top-level schemaVersion1.1, taxonomyVersion, language, status, allFictional and cases. Required per-case discovery metadata is specified in chapter07 and references discovery_taxonomy.json. Accept legacy1.0 only through explicit reviewed backfill before publication. Legacy durationMinutes remains compatibility maximum; selected-mode UI uses discovery.estimatedDurationMinutes. Each case requires unique key/slug, title, synopsis, kind (mini/tutorial/premium), access (free/paid), supported modes, duration, player bounds, briefing, suspect IDs/names, reason IDs/text, ordered rounds and answer. Round contains title, numbered clues and two hints with tiers 1/2. Each clue has unique ID, title, type=text/image/audio, body/transcript, round, visibility=assigned/public, optional asset and alt text. Answer contains valid suspectId/reasonId, decisiveClueIds, explanation and alternate-suspect eliminations.

All IDs scoped to a case version; never identify an answer by index in an unordered UI array. Validate reference integrity, sequential rounds, unique IDs, nonempty strings, valid enums, asset licences, transcripts, existence of both hint tiers and exactly one canonical answer pair. Check every decisive clue is accessible by the final round and that no clue or alt text unintentionally names the answer before its intended reveal. A schema validator cannot prove mystery logic; editorial review is still required.

Group distribution: take sorted frozen roster, deterministic seed, and distribute each round's assigned clues round-robin. Public clues appear for all. Wedding has six clues per round so every supported seat gets at least one. Validate distributions for four, five and six players. Tutorial's six clues distribute for two through six. For four players, some receive two; the player with one still contributes. Departed seats promote clues according to engineering rules; no permanent evidence loss. Solo sees all current round clues. Detectives are not suspects, so guest names never overwrite canonical characters.

## Starter wedding chronology (spoilers)

18:40 Dami receives vest T4. 18:50 handling invoice acknowledged paid. 18:55 van parked. 19:10 SG-17 gift logged. 19:12 Dami signs table delivery. 19:13–19:19 Tomi on stage, Bisi in kitchen, Kunle in booth with independent continuous recordings. 19:16–19:17 only gift-room opening. 19:17 T4 carrier exits with silver box. 19:18 Dami admits holding box at van bay in dispatch note. 19:19 he sends extra-fee demand identifying SG-17. 19:20 missing gift discovered. 19:22 manager finds sealed SG-17 in van. 19:30 vest and van record window ends.

Canonical pair: Dami + fee-demand. Correct alternative eliminations: nobody authorised safe storage, safe unopened, no photography prop, van did not leave for another wedding. Early clues create suspicion; final records establish identity and stated motive. The story concerns a fictional withheld gift, not violence. Use fake addresses, names, signatures and timestamps in assets; never produce a working real phone number or a scannable payment request.

## Spoilers and replay

Track exposure by case_id, not only version/mode. A player completing wedding solo is warned before joining wedding group: “You have solved a version of this case. Please avoid spoilers.” Don't block friends, but mark the attempt unranked. A different mode is not a new mystery. Distinct tutorial seeds avoid the first solo experience spoiling the first group case. Public share cards exclude suspects, answer IDs, decisive documents and full explanation.

## Editorial workflow

Draft → machine validation → editor review → blind test → revision → publisher approval → immutable publication. Staff permissions and audit required. Published changes create a new version; running attempts and rooms retain old version. Emergency unpublish prevents new starts without corrupting existing state. Unsafe/broken content may be blocked immediately with clear message, customer access restoration/refund and audit record.

Each case review records: coherent timeline, decisive evidence, independent alibis where needed, plausibility, explicit scope assumptions, why distractors fail, reading level, accessibility, rights, cultural sensitivity and spoiler check. Avoid requiring outside knowledge or real-world legal judgment to solve a contained puzzle. AI may assist drafts but an editor verifies every causal claim and removes contradictions.

Blind test at least three groups for a premium case before paid launch, ideally including different player counts. Ask players to explain the answer; correct guesses without evidence do not establish fairness. Record duration, rounds stalled, misunderstood clues, hint use and alternative plausible solutions. Revise when two testers independently identify a reasonable conflicting answer. Require no unresolved critical ambiguity before approval.

## Launch content requirement

Included seeds are intentionally insufficient for a broad daily-content launch. Before paid acquisition: approve fourteen distinct daily mini-cases, a free group tutorial and two premium cases. At least five daily cases and both premium cases need independent blind tests; all require editorial review. Do not quietly recycle a three-case queue as fourteen unique cases. Schedule at least seven days ahead. Agent should create remaining drafts with the same schema and tests, then present them for review without pretending external testing occurred.

Calendar stores explicit case_version_id by UTC date, no random changing choice during a day. A current attempt retains assigned release/date. If a release is missing/withdrawn, show archive fallback clearly; reuse does not extend daily streak for that same previously completed content. Notify content owner and preserve the player’s current attempt. Showcase durations are estimates derived from playtests once available.

## Discovery classification and content coverage (v1.1)

The seed importer must validate discovery tags, primary membership, mode durations, mood, difficulty and warnings review in addition to answer references. Supplied classifications are drafts: three mini solo cases use Everyday Mystery; Missing Microphone and Missing Wedding Gift use Wedding & Family. Do not invent Cold Case/Thriller content by relabelling these drafts. Seed difficulty is an editorial estimate until playtests. Taxonomy definitions/review workflow, metadata snapshots, deactivation and three-theme content gates are mandatory in chapter07. Additional theme coverage can be supplied within the fourteen daily/two-premium launch inventory; report unique-case totals separately from overlapping theme counts.
