import type { Sql } from "../db/types";
import { caseSchema, type Case } from "./content";
import { assert } from "./errors";

export type PremiumPolicy = {
  environment: "development" | "test";
  allowFixture: boolean;
};
export type PlayMode = "solo" | "group";
export type PlayableVersion = { id: string; content: Case; status: string };

export async function playableVersion(db: Sql, caseId: string) {
  return (
    await db.query<PlayableVersion>(
      "SELECT id,content,status FROM app_private.playable_versions WHERE case_key=$1 ORDER BY created_at DESC,id LIMIT 1",
      [caseId],
    )
  ).rows[0];
}

export function supportsPremium(
  version: PlayableVersion | undefined,
  mode: PlayMode,
  policy: PremiumPolicy | undefined,
) {
  if (!version || !policy) return false;
  const c = caseSchema.parse(version.content);
  return (
    c.access === "paid" &&
    c.kind === "premium" &&
    c.modes.includes(mode) &&
    (version.status === "published" ||
      (policy.allowFixture && c.key === "wedding-gift")) &&
    (mode === "solo" ||
      (c.maxPlayers >= Math.max(4, c.minPlayers) && c.maxPlayers <= 6))
  );
}

export async function ownsPremium(
  db: Sql,
  actor: string,
  caseId: string,
  mode: PlayMode,
  policy: PremiumPolicy,
) {
  const result = await db.query(
    `SELECT 1 FROM app_private.entitlements e
     JOIN app_private.products p ON p.id=e.product_id
     JOIN app_private.orders o ON o.id=e.origin_order_id
     WHERE e.owner_id=$1 AND p.case_key=$2 AND p.mode=$3
       AND e.state='active' AND NOT e.dispute_hold AND o.status='paid' AND o.environment=$4
       AND o.buyer_id=e.owner_id AND o.product_id=e.product_id
     FOR SHARE OF e`,
    [actor, caseId, mode, policy.environment],
  );
  return result.rows.length > 0;
}

export async function requirePremium(
  db: Sql,
  actor: string,
  version: PlayableVersion,
  mode: PlayMode,
  policy: PremiumPolicy | undefined,
) {
  assert(
    policy && supportsPremium(version, mode, policy),
    403,
    "CASE_UNAVAILABLE",
    "This premium case is unavailable in the selected mode.",
  );
  assert(
    await ownsPremium(db, actor, version.content.key, mode, policy),
    403,
    "PURCHASE_REQUIRED",
    "An active purchase for this case and play mode is required.",
  );
}

export async function premiumLibrary(
  db: Sql,
  actor: string,
  policy: PremiumPolicy | undefined,
) {
  if (!policy) return [];
  const { rows } = await db.query<{ caseId: string; mode: PlayMode }>(
    `SELECT p.case_key AS "caseId",p.mode FROM app_private.entitlements e
     JOIN app_private.products p ON p.id=e.product_id
     WHERE e.owner_id=$1 AND e.state='active' AND NOT e.dispute_hold ORDER BY p.case_key,p.mode`,
    [actor],
  );
  const games = [];
  for (const item of rows) {
    const version = await playableVersion(db, item.caseId);
    if (
      version &&
      supportsPremium(version, item.mode, policy) &&
      (await ownsPremium(db, actor, item.caseId, item.mode, policy))
    )
      games.push({ ...item, title: version.content.title });
  }
  return games;
}
