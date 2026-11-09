import { afterAll, beforeAll, expect, it } from "vitest";
import { embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
import type { Database } from "../lib/db/types";
import { createIdentity } from "../lib/domain/identity";
import { dailyClock, dailyOverview } from "../lib/domain/daily";
import { mutate, read, start } from "../lib/domain/game";
import { requestCode, verifyCode, type Mailer } from "../lib/domain/accounts";
import { dailySchema } from "../lib/contracts/daily";

let db: Database, staff: string, day: string;
const versions: Record<string, string> = {};
const secret = "test-secret-with-at-least-32-characters";
const inbox = new Map<string, string>();
const mailer: Mailer = {
  send: async (m) => {
    inbox.set(m.challengeId, m.code);
  },
};

beforeAll(async () => {
  db = await embedded();
  await migrate(db);
  await seedDrafts(db);
  staff = (await createIdentity(db)).id;
  await db.query(
    "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,'daily-staff@example.test')",
    [staff],
  );
  day = (await dailyClock(db)).day;
  for (const key of [
    "last-slice",
    "wrong-parcel",
    "playlist-switch",
    "wedding-gift",
  ]) {
    const { rows } = await db.query<{ id: string }>(
      "UPDATE app_private.case_versions SET status='published' WHERE case_key=$1 RETURNING id",
      [key],
    );
    versions[key] = rows[0].id;
    await db.query(
      "INSERT INTO app_private.case_releases(case_key,version_id,published_by) VALUES($1,$2,$3)",
      [key, rows[0].id, staff],
    );
  }
}, 30000);
afterAll(async () => db?.close());

async function schedule(key: string) {
  await db.query(
    "INSERT INTO app_private.daily_calendar(day,version_id,scheduled_by) VALUES($1,$2,$3) ON CONFLICT(day) DO UPDATE SET version_id=excluded.version_id",
    [day, versions[key], staff],
  );
  return { day, versionId: versions[key] };
}
async function finish(
  actor: string,
  attempt: Awaited<ReturnType<typeof start>>,
) {
  return mutate(db, actor, attempt.id, "accusation", {
    expectedVersion: attempt.stateVersion,
    suspectId: attempt.suspects[0].id,
    reasonId: attempt.reasons[0].id,
  });
}
async function shift(attemptId: string, days: number) {
  await db.query(
    "UPDATE app_private.attempts SET daily_day=daily_day-$2::int WHERE id=$1",
    [attemptId, days],
  );
}

it("shows an archive gap and refuses a paid or stale release", async () => {
  const guest = (await createIdentity(db)).id;
  const overview = dailySchema.parse(await dailyOverview(db, null));
  expect(overview).toMatchObject({
    day,
    release: null,
    streak: 0,
    archive: { caseId: "last-slice" },
  });
  expect(new Date(overview.resetsAt).getUTCHours()).toBe(0);
  const invalid = await schedule("wedding-gift");
  expect((await dailyOverview(db, null)).release).toBeNull();
  await expect(start(db, guest, invalid)).rejects.toMatchObject({
    code: "DAILY_CHANGED",
  });
  const input = await schedule("last-slice");
  await expect(
    start(db, guest, { ...input, day: "2000-01-01" }),
  ).rejects.toMatchObject({ code: "DAILY_CHANGED" });
  expect(JSON.stringify(await dailyOverview(db, null))).not.toContain(
    "decisiveClueIds",
  );
});

it("serializes daily starts and keeps a frozen case resumable after rollover or withdrawal", async () => {
  const guest = (await createIdentity(db)).id;
  const input = await schedule("last-slice");
  const [a, b] = await Promise.all([
    start(db, guest, input),
    start(db, guest, input),
  ]);
  expect(a.id).toBe(b.id);
  expect(a.dailyDay).toBe(day);
  await shift(a.id, 1);
  const next = await schedule("wrong-parcel");
  await db.query(
    "UPDATE app_private.case_releases SET enabled=false WHERE case_key='last-slice'",
  );
  try {
    const overview = await dailyOverview(db, guest);
    expect(overview.resume?.attemptId).toBe(a.id);
    expect((await dailyOverview(db, null)).resume).toBeNull();
    expect((await finish(guest, a)).result).not.toBeNull();
    expect((await dailyOverview(db, guest)).streak).toBe(1);
    const current = await start(db, guest, next);
    await finish(guest, current);
    expect((await dailyOverview(db, guest)).streak).toBe(2);
    expect((await start(db, guest, next)).id).toBe(current.id);
    const replay = await start(db, guest, "wrong-parcel");
    expect(replay.dailyDay).toBeNull();
    await finish(guest, replay);
    expect((await dailyOverview(db, guest)).streak).toBe(2);
    await shift(a.id, 2);
    expect((await dailyOverview(db, guest)).streak).toBe(1);
  } finally {
    await db.query(
      "UPDATE app_private.case_releases SET enabled=true WHERE case_key='last-slice'",
    );
  }
});

it("preserves completed daily credit across account merge and ignores repeated releases", async () => {
  const email = "daily-player@example.test";
  const target = (await createIdentity(db)).id;
  const source = (await createIdentity(db)).id;
  const challenge = await requestCode(db, target, email, secret, mailer);
  await verifyCode(
    db,
    target,
    challenge.challengeId,
    inbox.get(challenge.challengeId)!,
    secret,
  );
  const input = await schedule("playlist-switch");
  const targetAttempt = await start(db, target, input);
  const sourceAttempt = await start(db, source, input);
  await finish(source, sourceAttempt);
  const merge = await requestCode(db, source, email, secret, mailer);
  await verifyCode(
    db,
    source,
    merge.challengeId,
    inbox.get(merge.challengeId)!,
    secret,
    true,
  );
  expect((await read(db, target, targetAttempt.id)).dailyDay).toBeNull();
  expect((await dailyOverview(db, target)).release).toMatchObject({
    attemptId: sourceAttempt.id,
    completed: true,
  });
  await shift(sourceAttempt.id, 1);
  await finish(target, await start(db, target, input));
  expect((await dailyOverview(db, target)).streak).toBe(1);
});
