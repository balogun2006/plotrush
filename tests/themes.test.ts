import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import {
  createIdentity,
  saveInterests,
  interests,
  uuidInterests,
  saveUuidInterests,
} from "../lib/domain/identity";
import { enroll, unlock, type StaffRole } from "../lib/domain/staff";
import { totp } from "../lib/security/totp";
import * as editorial from "../lib/domain/editorial";
import { themeRegistry } from "../lib/domain/themes";
import { discoverySnapshot, themePage } from "../lib/domain/discovery";
import {
  editTheme,
  listThemeEditorial,
  createTheme,
  renameTheme,
  writeMood,
} from "../lib/domain/theme-editorial";
import { parseFilters, modeFor } from "../lib/domain/catalogue";
import { catalogue, start, read } from "../lib/domain/game";
import { preferenceScore } from "../lib/domain/recommendations";
import { emptyInterests } from "../lib/contracts/interests";
import { card } from "../lib/domain/content";
import type { Theme } from "../lib/contracts/themes";
import type { Case } from "../lib/domain/content";
let db: Database,
  editor: editorial.StaffContext,
  publisher: editorial.StaffContext,
  finance: editorial.StaffContext,
  source: Case;
const secret = "synthetic-theme-master-with-32-characters";
const review = {
  logic: true,
  accessibility: true,
  rights: true,
  sensitivity: true,
  spoilers: true,
  blindTest: "Synthetic fixture test; no external review claimed.",
  notes: "Synthetic review solely for automated taxonomy verification.",
};
async function staff(role: StaffRole) {
  const who = await createIdentity(db);
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
    [who.id, randomUUID() + "@example.test"],
  );
  await db.query(
    "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2)",
    [who.id, [role]],
  );
  const setup = await enroll(db, who.id, who.token, secret);
  return {
    actor: who.id,
    playerToken: who.token,
    staffToken: await unlock(
      db,
      who.id,
      who.token,
      totp(setup.secret, Math.floor(Date.now() / 30000)),
      secret,
    ),
  };
}
const q = (query = "") => new URLSearchParams(query);
async function theme(slug: string) {
  return (await themeRegistry(db)).find((t) => t.slug === slug)!;
}
function input(t: Theme, changes = {}) {
  return {
    label: t.label,
    description: t.description,
    status: t.status,
    displayOrder: t.displayOrder,
    promoteOnHome: t.promoteOnHome,
    expectedRevision: t.revision,
    reason: "Synthetic taxonomy change for automated verification.",
    ...changes,
  };
}
async function approved(c: Case) {
  let d = await editorial.createDraft(db, editor, c);
  d = await editorial.transition(db, editor, d.id, d.revision, "submit");
  return editorial.transition(
    db,
    publisher,
    d.id,
    d.revision,
    "approve",
    review,
  );
}
async function publish(c: Case) {
  const d = await approved(c);
  return editorial.transition(
    db,
    publisher,
    d.id,
    d.revision,
    "publish",
    undefined,
    true,
  );
}
beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
  editor = await staff("content_editor");
  publisher = await staff("content_publisher");
  finance = await staff("finance");
  source = (
    await db.query<{ content: Case }>(
      "SELECT content FROM app_private.case_versions WHERE case_key='last-slice' LIMIT 1",
    )
  ).rows[0].content;
}, 30000);
afterAll(async () => db?.close());
it("seeds stable identities and preserves publisher edits across repeat migration", async () => {
  const before = await theme("heist");
  await editTheme(
    db,
    publisher,
    before.slug,
    input(before, { label: "Heist investigations" }),
    true,
  );
  await migrate(db);
  const after = await theme("heist");
  expect(after.id).toBe(before.id);
  expect(after.label).toBe("Heist investigations");
  expect(after.revision).toBe(2);
  await expect(
    db.query("UPDATE app_private.themes SET slug='renamed' WHERE slug='heist'"),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM app_private.themes WHERE slug='heist'"),
  ).rejects.toThrow();
});
it("returns accurate mode/access counts and no fabricated reviewed promotion", async () => {
  const solo = await discoverySnapshot(db, q("mode=solo&access=free")),
    group = await discoverySnapshot(db, q("mode=group&access=free"));
  expect(solo.cases).toHaveLength(3);
  expect(solo.themes.find((t) => t.slug === "everyday-mystery")?.count).toBe(3);
  expect(solo.themes.find((t) => t.slug === "wedding-family")?.count).toBe(0);
  expect(group.cases).toHaveLength(1);
  expect(group.themes.find((t) => t.slug === "wedding-family")?.count).toBe(1);
  expect((await discoverySnapshot(db, q("access=paid"))).cases).toEqual([]);
  expect(
    solo.themes.every((t) => t.reviewedCount === 0 && !t.ready && !t.promoted),
  ).toBe(true);
  expect(JSON.stringify(solo)).not.toMatch(
    /decisiveClueIds|eliminations|"answer"|"clues"/,
  );
  await expect(
    themePage(db, "unknown-theme", parseFilters(q())),
  ).rejects.toMatchObject({ status: 404 });
});
it("denies non-publishers, stale MFA, disabled publishing and draft-only promotion", async () => {
  const t = await theme("heist");
  for (const ctx of [editor, finance, { ...publisher, staffToken: undefined }])
    await expect(
      editTheme(db, ctx, t.slug, input(t), true),
    ).rejects.toMatchObject({ status: 403 });
  await expect(listThemeEditorial(db, finance)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    editTheme(db, publisher, t.slug, input(t), false),
  ).rejects.toMatchObject({ code: "PUBLISH_DISABLED" });
  const everyday = await theme("everyday-mystery");
  await expect(
    editTheme(
      db,
      publisher,
      everyday.slug,
      input(everyday, { promoteOnHome: true }),
      true,
    ),
  ).rejects.toMatchObject({ code: "SHELF_NOT_READY" });
});
it("fences concurrent edits and audits one successful change", async () => {
  const t = await theme("cold-case");
  const outcomes = await Promise.allSettled(
    [10, 11].map((displayOrder) =>
      editTheme(db, publisher, t.slug, input(t, { displayOrder }), true),
    ),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE_REVISION" },
  });
  expect(
    (
      await db.query(
        "SELECT id FROM app_private.audit_events WHERE action='editorial.theme_updated' AND entity_id='cold-case'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("protects referenced themes and preserves private choices when an unused shelf retires", async () => {
  const populated = await theme("everyday-mystery");
  await expect(
    editTheme(
      db,
      publisher,
      populated.slug,
      input(populated, { status: "retired" }),
      true,
    ),
  ).rejects.toMatchObject({ code: "THEME_IN_USE" });
  const t = await theme("heist"),
    who = (await createIdentity(db)).id;
  await saveInterests(db, who, ["heist"], 0);
  await editTheme(db, publisher, t.slug, input(t, { status: "retired" }), true);
  await expect(discoverySnapshot(db, q("themes=heist"))).rejects.toMatchObject({
    code: "FILTER_UNAVAILABLE",
  });
  const page = await themePage(
    db,
    "heist",
    parseFilters(q("mode=group&access=free")),
  );
  expect(page.theme.status).toBe("retired");
  expect(page.cases).toEqual([]);
  expect(page.alternatives.map((a) => a.slug)).toEqual(["wedding-family"]);
  await expect(
    saveInterests(db, (await createIdentity(db)).id, ["heist"], 0),
  ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  await saveInterests(db, who, ["heist"], 1, { personalisationEnabled: false });
  expect(await interests(db, who)).toMatchObject({
    themes: ["heist"],
    personalisationEnabled: false,
  });
});
it("serializes retirement against publication so a retired tag cannot become playable", async () => {
  const t = await theme("cold-case"),
    key = "theme-" + randomUUID();
  const c = {
    ...structuredClone(source),
    key,
    slug: key,
    discovery: {
      ...source.discovery,
      primaryTheme: "cold-case" as const,
      themes: ["cold-case" as const],
    },
  };
  const draft = await approved(c);
  const outcomes = await Promise.allSettled([
    editorial.transition(
      db,
      publisher,
      draft.id,
      draft.revision,
      "publish",
      undefined,
      true,
    ),
    editTheme(db, publisher, t.slug, input(t, { status: "retired" }), true),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const state = await theme(t.slug);
  expect(
    (await discoverySnapshot(db, q())).cases.some((item) => item.id === key),
  ).toBe(state.status === "enabled");
});
it("requires reviewed distinct supply and recomputes promotion eligibility after withdrawal", async () => {
  const originalCount = (await discoverySnapshot(db, q("mode=solo"))).cases
    .length;
  const keys: string[] = [];
  for (let n = 0; n < 3; n++) {
    const key = "reviewed-" + randomUUID();
    keys.push(key);
    await publish({
      ...structuredClone(source),
      key,
      slug: key,
      discovery: {
        ...source.discovery,
        primaryTheme: "thriller",
        themes: ["thriller", "wedding-family"],
      },
    });
  }
  const t = await theme("thriller");
  await editTheme(
    db,
    publisher,
    t.slug,
    input(t, { promoteOnHome: true }),
    true,
  );
  const snapshot = await discoverySnapshot(db, q("mode=solo"));
  expect(snapshot.themes.find((t) => t.slug === "thriller")).toMatchObject({
    count: 3,
    reviewedCount: 3,
    ready: true,
    promoted: true,
  });
  expect(snapshot.cases).toHaveLength(originalCount + 3);
  expect(new Set(snapshot.cases.map((c) => c.id)).size).toBe(
    snapshot.cases.length,
  );
  await editorial.unpublish(
    db,
    publisher,
    keys[0],
    "Synthetic shelf supply withdrawal.",
  );
  expect(
    (await discoverySnapshot(db, q())).themes.find(
      (t) => t.slug === "thriller",
    ),
  ).toMatchObject({ count: 2, ready: false, promoted: false });
});
it("projects current labels without retagging or changing frozen canon", async () => {
  const t = await theme("everyday-mystery");
  const before = (
    await db.query(
      "SELECT checksum FROM app_private.case_versions WHERE case_key='last-slice' ORDER BY id",
    )
  ).rows;
  await editTheme(
    db,
    publisher,
    t.slug,
    input(t, { label: "Everyday investigations" }),
    true,
  );
  const item = (await catalogue(db)).find((c) => c.id === "last-slice")!;
  expect(item.themeLabels["everyday-mystery"]).toBe("Everyday investigations");
  expect(
    preferenceScore(item, { ...emptyInterests(), themes: ["everyday-mystery"] })
      .recommendationReason,
  ).toContain("Everyday investigations");
  expect(
    (
      await db.query(
        "SELECT checksum FROM app_private.case_versions WHERE case_key='last-slice' ORDER BY id",
      )
    ).rows,
  ).toEqual(before);
});
it("preserves selected mode/duration and does not advertise unsupported free group modes", async () => {
  const key = "dual-" + randomUUID();
  await publish({
    ...structuredClone(source),
    key,
    slug: key,
    minPlayers: 2,
    maxPlayers: 6,
    modes: ["solo", "group"],
    discovery: {
      ...source.discovery,
      estimatedDurationMinutes: { solo: 8, group: 12 },
    },
  });
  const item = (await discoverySnapshot(db, q("mode=solo"))).cases.find(
    (c) => c.id === key,
  )!;
  expect(item.modes).toEqual(["solo"]);
  expect(item.discovery.estimatedDurationMinutes.group).toBeUndefined();
  const tutorial = card({
    ...source,
    kind: "tutorial",
    modes: ["solo", "group"],
    discovery: {
      ...source.discovery,
      estimatedDurationMinutes: { solo: 8, group: 12 },
    },
  });
  expect(modeFor(tutorial, parseFilters(q("mode=group")))).toBe("group");
  expect(modeFor(tutorial, parseFilters(q("mode=any&duration=10to19")))).toBe(
    "group",
  );
  expect(modeFor(tutorial, parseFilters(q("mode=any&duration=lt10")))).toBe(
    "solo",
  );
});

it("binds cursor pages to filters, limits and catalogue revisions without duplicate cases", async () => {
  const query = "mode=solo&access=free&limit=2";
  const first = await discoverySnapshot(db, q(query));
  expect(first.total).toBeGreaterThanOrEqual(3);
  expect(first.cases).toHaveLength(2);
  expect(first.nextCursor).toBeTruthy();
  const next = await discoverySnapshot(
    db,
    q(query + "&cursor=" + first.nextCursor),
  );
  expect(next.total).toBe(first.total);
  expect(next.cases.every((c) => !first.cases.some((x) => x.id === c.id))).toBe(
    true,
  );
  expect(first.facets.duration.lt10).toBeGreaterThanOrEqual(3);
  await expect(
    discoverySnapshot(db, q("mode=group&limit=2&cursor=" + first.nextCursor)),
  ).rejects.toMatchObject({ status: 400, code: "CURSOR_INVALID" });
  await expect(
    discoverySnapshot(db, q(query + "&cursor=not-a-cursor")),
  ).rejects.toMatchObject({ status: 400 });
  const t = await theme("cold-case");
  await editTheme(
    db,
    publisher,
    t.slug,
    input(t, { description: t.description + " Updated." }),
    true,
  );
  await expect(
    discoverySnapshot(db, q(query + "&cursor=" + first.nextCursor)),
  ).rejects.toMatchObject({ status: 409, code: "CURSOR_STALE" });
  await expect(
    discoverySnapshot(db, q("themes=not-in-registry")),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    discoverySnapshot(db, q("moods=not-in-registry")),
  ).rejects.toMatchObject({ status: 400 });
});
it("creates taxonomy with role, publication and concurrent namespace protection", async () => {
  const b = {
    slug: "record-room",
    label: "Record Room",
    description: "Synthetic tag for an automated record investigation.",
    displayOrder: 20,
    status: "enabled",
    reason: "Synthetic taxonomy creation test only.",
  };
  await expect(createTheme(db, editor, b, true)).rejects.toMatchObject({
    status: 403,
  });
  await expect(createTheme(db, publisher, b, false)).rejects.toMatchObject({
    status: 503,
  });
  const result = await Promise.allSettled([
    createTheme(db, publisher, b, true),
    createTheme(db, publisher, b, true),
  ]);
  expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const m = await writeMood(
    db,
    publisher,
    null,
    {
      slug: "reflective",
      label: "Reflective",
      status: "enabled",
      reason: b.reason,
    },
    true,
  );
  await expect(
    writeMood(
      db,
      finance,
      m.slug,
      {
        label: "No",
        status: "enabled",
        expectedRevision: m.revision,
        reason: b.reason,
      },
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    writeMood(
      db,
      publisher,
      m.slug,
      {
        label: m.label,
        status: "enabled",
        expectedRevision: 20,
        reason: b.reason,
      },
      true,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("publishes relational tags and keeps UUID preferences and frozen games through managed renames", async () => {
  const t = await theme("record-room"),
    m = (
      await db.query<{ id: string }>(
        "SELECT id FROM app_private.moods WHERE slug='reflective'",
      )
    ).rows[0];
  const who = await createIdentity(db);
  await saveUuidInterests(db, who.id, {
    themeIds: [t.id],
    moodIds: [m.id],
    preferredDifficulty: null,
    personalisationEnabled: true,
    expectedVersion: 0,
  });
  const c = structuredClone(source);
  c.key = "taxonomy-projection-test";
  c.slug = c.key;
  c.discovery.themes = [t.slug, "everyday-mystery"];
  c.discovery.primaryTheme = t.slug;
  c.discovery.moods = ["reflective"];
  await publish(c);
  const attempt = await start(db, who.id, c.key);
  const original = await read(db, who.id, attempt.id);
  const checksum = (
    await db.query<{ checksum: string }>(
      "SELECT checksum FROM app_private.case_versions WHERE case_key=$1",
      [c.key],
    )
  ).rows[0].checksum;
  const renamed = await renameTheme(
    db,
    publisher,
    t.slug,
    {
      slug: "record-investigations",
      expectedRevision: t.revision,
      reason: "Synthetic managed rename for preservation testing.",
    },
    true,
  );
  expect(renamed.id).toBe(t.id);
  expect(
    (await catalogue(db)).find((x) => x.id === c.key)?.discovery.primaryTheme,
  ).toBe(renamed.slug);
  expect((await interests(db, who.id)).themes).toEqual([renamed.slug]);
  expect((await uuidInterests(db, who.id)).themeIds).toEqual([t.id]);
  expect(await read(db, who.id, attempt.id)).toEqual(original);
  await expect(
    createTheme(
      db,
      publisher,
      {
        slug: t.slug,
        label: "Conflict",
        description: "Reserved old URL must remain unavailable for reuse.",
        displayOrder: 20,
        status: "enabled",
        reason: "Synthetic alias reuse denial test.",
      },
      true,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    editTheme(
      db,
      publisher,
      renamed.slug,
      input(renamed, { status: "retired" }),
      true,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    writeMood(
      db,
      publisher,
      "reflective",
      {
        label: "Reflective",
        status: "retired",
        expectedRevision: 1,
        reason: "Synthetic in-use mood retirement test.",
      },
      true,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await migrate(db);
  await seedDrafts(db);
  expect((await themeRegistry(db)).some((x) => x.slug === t.slug)).toBe(false);
  expect((await theme(renamed.slug)).id).toBe(t.id);
  expect(
    (
      await db.query<{ checksum: string }>(
        "SELECT checksum FROM app_private.case_versions WHERE case_key=$1",
        [c.key],
      )
    ).rows[0].checksum,
  ).toBe(checksum);
  expect((await uuidInterests(db, who.id)).moodIds).toEqual([m.id]);
  const saved = await uuidInterests(db, who.id);
  await expect(
    saveUuidInterests(db, who.id, {
      themeIds: [randomUUID()],
      moodIds: [],
      preferredDifficulty: null,
      personalisationEnabled: true,
      expectedVersion: saved.preferenceVersion,
    }),
  ).rejects.toMatchObject({ status: 400 });
  const other = await createIdentity(db);
  expect((await uuidInterests(db, other.id)).themeIds).toEqual([]);
  await expect(
    db.query(
      "INSERT INTO app_private.case_version_themes(case_version_id,theme_id,is_primary) SELECT id,$1,false FROM app_private.case_versions LIMIT 1",
      [randomUUID()],
    ),
  ).rejects.toThrow();
});
it("tag revisions change only the current catalogue and retain historical metadata", async () => {
  const t = await theme("record-investigations"),
    who = await createIdentity(db);
  const attempt = await start(db, who.id, "taxonomy-projection-test"),
    before = await read(db, who.id, attempt.id);
  const c = structuredClone(source);
  c.key = "taxonomy-projection-test";
  c.slug = c.key;
  c.discovery.themes = ["everyday-mystery"];
  c.discovery.primaryTheme = "everyday-mystery";
  c.discovery.moods = ["lighthearted"];
  await publish(c);
  expect(
    (await catalogue(db)).find((x) => x.id === c.key)?.discovery.themes,
  ).toEqual(["everyday-mystery"]);
  expect(await read(db, who.id, attempt.id)).toEqual(before);
  const old = (
    await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM app_private.case_version_themes WHERE theme_id=$1",
      [t.id],
    )
  ).rows[0].count;
  expect(old).toBe(1);
  await editTheme(db, publisher, t.slug, input(t, { status: "retired" }), true);
  expect((await themePage(db, t.slug, parseFilters(q()))).cases).toEqual([]);
  expect(await read(db, who.id, attempt.id)).toEqual(before);
});
it("retired moods preserve existing choices but reject new selections", async () => {
  const m = await writeMood(
      db,
      publisher,
      null,
      {
        slug: "quiet",
        label: "Quiet",
        status: "enabled",
        reason: "Synthetic empty mood retirement check.",
      },
      true,
    ),
    who = await createIdentity(db);
  await saveInterests(db, who.id, [], 0, { moods: [m.slug] });
  await writeMood(
    db,
    publisher,
    m.slug,
    {
      label: m.label,
      status: "retired",
      expectedRevision: 1,
      reason: "Synthetic empty mood retirement check.",
    },
    true,
  );
  await saveInterests(db, who.id, [], 1, { personalisationEnabled: false });
  expect((await interests(db, who.id)).moods).toEqual([m.slug]);
  const other = await createIdentity(db);
  await expect(
    saveInterests(db, other.id, [], 0, { moods: [m.slug] }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    discoverySnapshot(db, q("moods=" + m.slug)),
  ).rejects.toMatchObject({ status: 409 });
  await saveInterests(db, who.id, [], 2, { moods: [] });
  expect((await interests(db, who.id)).moods).toEqual([]);
});
