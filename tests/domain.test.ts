import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import {
  createIdentity,
  identity,
  interests,
  saveInterests,
  limit,
} from "../lib/domain/identity";
import { start, read, mutate, catalogue } from "../lib/domain/game";
import {
  parseFilters,
  filterCases,
  inBucket,
  facets,
} from "../lib/domain/catalogue";
import { caseSchema, Case, card } from "../lib/domain/content";
import type { Database } from "../lib/db/types";
let db: Database, alice: string, bob: string, cases: Case[];
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
  alice = (await createIdentity(db)).id;
  bob = (await createIdentity(db)).id;
  cases = JSON.parse(
    await readFile("docs/implementation/starter_cases.json", "utf8"),
  ).cases.map((x: unknown) => caseSchema.parse(x));
}, 30000);
afterAll(async () => db?.close());
describe("private durable solo engine", () => {
  it("imports five drafts idempotently", async () => {
    await seedDrafts(db);
    expect((await catalogue(db)).length).toBe(5);
  });
  it("authenticates opaque tokens and rejects guessed/expired identities", async () => {
    const s = await createIdentity(db);
    expect(await identity(db, s.token)).toBe(s.id);
    expect(await identity(db, "a".repeat(64))).toBeNull();
    expect(await identity(db, s.id)).toBeNull();
    await db.query(
      "UPDATE app_private.sessions SET expires_at=now()-interval '1 minute' WHERE principal_id=$1",
      [s.id],
    );
    expect(await identity(db, s.token)).toBeNull();
  });
  it("starts and resumes one active attempt with no solution projection", async () => {
    const a = await start(db, alice, "last-slice");
    const again = await start(db, alice, "last-slice");
    expect(a.id).toBe(again.id);
    expect(a.result).toBeNull();
    expect(JSON.stringify(a)).not.toContain("decisiveClueIds");
    expect(JSON.stringify(a)).not.toContain("eliminations");
    expect(a.rounds[0].hints[0]).not.toHaveProperty("text");
  });
  it("denies another guest reads, notes, hints and accusations", async () => {
    const a = await start(db, alice, "last-slice");
    await expect(read(db, bob, a.id)).rejects.toMatchObject({ status: 404 });
    for (const action of ["notes", "hints", "accusation"])
      await expect(
        mutate(db, bob, a.id, action, {
          expectedVersion: 1,
          text: "intrusion",
          hintId: "slice-h1",
          suspectId: "tunde",
          reasonId: "fridge-log",
        }),
      ).rejects.toMatchObject({ status: 404 });
  });
  it("persists owner notes, rejects stale writes and grants free hints", async () => {
    let a = await start(db, alice, "last-slice");
    a = await mutate(db, alice, a.id, "notes", {
      expectedVersion: a.stateVersion,
      text: "14:47 overlaps the kitchen visit.",
    });
    expect((await read(db, alice, a.id)).notes).toContain("14:47");
    await expect(
      mutate(db, alice, a.id, "notes", { expectedVersion: 1, text: "old tab" }),
    ).rejects.toMatchObject({ status: 409 });
    a = await mutate(db, alice, a.id, "hints", {
      expectedVersion: a.stateVersion,
      hintId: "slice-h1",
    });
    expect(a.rounds[0].hints[0]).toHaveProperty("text");
    await expect(
      mutate(db, alice, a.id, "hints", {
        expectedVersion: a.stateVersion,
        hintId: "unknown",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rejects premium and group cases without inventing entitlements", async () => {
    await expect(start(db, alice, "wedding-gift")).rejects.toMatchObject({
      status: 403,
    });
    await expect(start(db, alice, "missing-mic")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("validates choices then freezes the result under concurrent submissions", async () => {
    const a = await start(db, alice, "last-slice");
    await expect(
      mutate(db, alice, a.id, "accusation", {
        expectedVersion: a.stateVersion,
        suspectId: "forged",
        reasonId: "fridge-log",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const responses = await Promise.all([
      mutate(db, alice, a.id, "accusation", {
        expectedVersion: a.stateVersion,
        suspectId: "tunde",
        reasonId: "fridge-log",
      }),
      mutate(db, alice, a.id, "accusation", {
        expectedVersion: a.stateVersion,
        suspectId: "ada",
        reasonId: "delivery",
      }),
    ]);
    expect(responses[0].result).toEqual(responses[1].result);
    expect(responses[0].result?.score).toBe(100);
    expect((await read(db, alice, a.id)).result?.answer.explanation).toContain(
      "Tunde",
    );
    await expect(
      mutate(db, alice, a.id, "notes", {
        expectedVersion: responses[0].stateVersion,
        text: "change",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("a wrong answer still receives the explanation, never overwrites prior results", async () => {
    const a = await start(db, alice, "last-slice");
    const r = await mutate(db, alice, a.id, "accusation", {
      expectedVersion: a.stateVersion,
      suspectId: "ada",
      reasonId: "delivery",
    });
    expect(r.result?.score).toBe(0);
    expect(r.result?.answer.suspectId).toBe("tunde");
    expect(
      (
        await db.query(
          "SELECT id FROM app_private.attempts WHERE principal_id=$1 AND result IS NOT NULL",
          [alice],
        )
      ).rows.length,
    ).toBe(2);
  });
  it("bounds shared durable rate counters", async () => {
    await limit(db, "test", 2, 60);
    await limit(db, "test", 2, 60);
    await expect(limit(db, "test", 2, 60)).rejects.toMatchObject({
      status: 429,
    });
  });
  it("keeps interests owner-only and detects concurrent edits", async () => {
    expect((await interests(db, bob)).themes).toEqual([]);
    await saveInterests(db, alice, ["cold-case"], 0);
    expect((await interests(db, alice)).themes).toEqual(["cold-case"]);
    expect((await interests(db, bob)).themes).toEqual([]);
    await expect(
      saveInterests(db, alice, ["thriller"], 0),
    ).rejects.toMatchObject({ status: 409 });
    expect((await saveInterests(db, alice, [], 1)).themes).toEqual([]);
  });
  it("freezes content versions without changing running attempts", async () => {
    const a = await start(db, bob, "wrong-parcel");
    await seedDrafts(db);
    expect((await read(db, bob, a.id)).title).toBe("The Wrong Parcel");
  });
  it("catalogue payloads contain no clues or answers", async () => {
    const output = JSON.stringify(await catalogue(db));
    for (const key of [
      "answer",
      "explanation",
      "clues",
      "briefing",
      "decisiveClueIds",
    ])
      expect(output).not.toContain('"' + key + '"');
  });
});
describe("discovery contracts", () => {
  it.each([
    [9, "lt10"],
    [10, "10to19"],
    [19, "10to19"],
    [20, "20to30"],
    [30, "20to30"],
    [31, "gt30"],
  ])("matches %s minutes only in %s", (n, b) => {
    expect(inBucket(Number(n), String(b))).toBe(true);
    expect(
      ["lt10", "10to19", "20to30", "gt30"].filter((x) =>
        inBucket(Number(n), x),
      ),
    ).toEqual([b]);
  });
  it("rejects unknown, repeated, and overlong filters", () => {
    for (const q of [
      "themes=made-up",
      "mode=solo&mode=group",
      "sort=sql",
      "themes=" + "x".repeat(2100),
    ])
      expect(() => parseFilters(new URLSearchParams(q))).toThrow();
  });
  it("uses OR within themes, AND across facets, deduplicated cards", () => {
    const cards = cases.map(card);
    const f = parseFilters(
      new URLSearchParams(
        "themes=everyday-mystery,wedding-family&mode=solo&access=free&duration=lt10",
      ),
    );
    expect(filterCases(cards, f).length).toBe(3);
    expect(
      filterCases(
        cards,
        parseFilters(
          new URLSearchParams(
            "themes=cold-case,thriller&mode=solo&access=free",
          ),
        ),
      ),
    ).toEqual([]);
  });
  it("validates invalid answer references and duplicate tags", () => {
    const invalid = structuredClone(cases[0]);
    invalid.answer.suspectId = "fake";
    expect(caseSchema.safeParse(invalid).success).toBe(false);
    const duplicate = structuredClone(cases[0]);
    duplicate.discovery.themes.push(duplicate.discovery.primaryTheme);
    expect(caseSchema.safeParse(duplicate).success).toBe(false);
  });
  it("facets retain access and mode while removing their own active facet", () => {
    const f = parseFilters(
      new URLSearchParams("themes=cold-case&mode=solo&access=free"),
    );
    expect(facets(cases.map(card), f).themes["everyday-mystery"]).toBe(3);
    expect(facets(cases.map(card), f).themes["wedding-family"]).toBe(0);
  });
});
