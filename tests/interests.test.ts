import { beforeAll, afterAll, it, expect } from "vitest";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import {
  createIdentity,
  interests,
  saveInterests,
} from "../lib/domain/identity";
import {
  recommendations,
  preferenceScore,
} from "../lib/domain/recommendations";
import { catalogue } from "../lib/domain/game";
import { emptyInterests } from "../lib/contracts/interests";
import type { Database } from "../lib/db/types";
let db: Database;
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
}, 30000);
afterAll(async () => db?.close());
it("persists private preferences through repeat migration and legacy theme-only writes", async () => {
  const alice = (await createIdentity(db)).id,
    bob = (await createIdentity(db)).id;
  await saveInterests(db, alice, ["cold-case"], 0, {
    moods: ["dark"],
    preferredDifficulty: "expert",
    personalisationEnabled: false,
  });
  await migrate(db);
  await saveInterests(db, alice, ["heist"], 1);
  expect(await interests(db, alice)).toEqual({
    themes: ["heist"],
    moods: ["dark"],
    preferredDifficulty: "expert",
    personalisationEnabled: false,
    version: 2,
  });
  expect(await interests(db, bob)).toEqual(emptyInterests());
  await expect(
    db.query(
      "UPDATE app_private.interests SET moods='[\"unknown\"]' WHERE principal_id=$1",
      [alice],
    ),
  ).rejects.toThrow();
});
it("validates all preferences and serializes competing versions", async () => {
  const actor = (await createIdentity(db)).id;
  await expect(saveInterests(db, actor, ["unknown"], 0)).rejects.toThrow();
  await expect(
    saveInterests(db, actor, [], 0, { moods: ["dark", "dark"] }),
  ).rejects.toThrow();
  const writes = await Promise.allSettled([
    saveInterests(db, actor, [], 0, { moods: ["dark"] }),
    saveInterests(db, actor, [], 0, { moods: ["lighthearted"] }),
  ]);
  expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(writes.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
});
it("scores each dimension once and disables every score and personalised label on opt-out", async () => {
  const fixture = (await catalogue(db))[0];
  const c = {
    ...fixture,
    discovery: {
      ...fixture.discovery,
      themes: ["thriller", "cold-case"] as typeof fixture.discovery.themes,
      moods: ["dark", "suspenseful"] as typeof fixture.discovery.moods,
      difficulty: "expert" as const,
    },
  };
  const prefs = {
    ...emptyInterests(),
    themes: c.discovery.themes,
    moods: c.discovery.moods,
    preferredDifficulty: "expert" as const,
  };
  expect(preferenceScore(c, prefs).rank).toBe(6);
  expect(preferenceScore(c, { ...prefs, themes: [] }).rank).toBe(3);
  expect(preferenceScore(c, { ...prefs, themes: [], moods: [] }).rank).toBe(1);
  expect(
    preferenceScore(c, { ...prefs, personalisationEnabled: false }).rank,
  ).toBe(0);
  const actor = (await createIdentity(db)).id;
  await saveInterests(db, actor, [], 0, {
    moods: fixture.discovery.moods,
    preferredDifficulty: fixture.discovery.difficulty,
  });
  expect((await recommendations(db, actor, new URLSearchParams())).label).toBe(
    "For you",
  );
  await saveInterests(db, actor, [], 1, { personalisationEnabled: false });
  const result = await recommendations(db, actor, new URLSearchParams());
  expect(result.label).toBe("Featured mysteries");
  expect(result.cases.every((item) => item.rank === 0)).toBe(true);
  expect(
    (
      await recommendations(
        db,
        actor,
        new URLSearchParams("themes=supernatural"),
      )
    ).cases,
  ).toEqual([]);
});
