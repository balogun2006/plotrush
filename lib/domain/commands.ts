import { createHash } from "node:crypto";
import type { Sql } from "../db/types";
import { assert } from "./errors";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function commandHash(input: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
}
// Caller holds the principal lock; receipts and domain writes commit together.
export async function replayCommand<T>(
  tx: Sql,
  actor: string,
  route: string,
  key: string | undefined,
  input: unknown,
): Promise<T | null> {
  if (!key) return null;
  const r = (
    await tx.query<{ request_hash: string; response_ref: T }>(
      "SELECT request_hash,response_ref FROM app_private.command_receipts WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
      [actor, route, key],
    )
  ).rows[0];
  if (!r) return null;
  assert(
    r.request_hash === commandHash(input),
    409,
    "IDEMPOTENCY_CONFLICT",
    "This request key was already used for a different action.",
  );
  return r.response_ref;
}
export async function recordCommand(
  tx: Sql,
  actor: string,
  route: string,
  key: string | undefined,
  input: unknown,
  reference: unknown,
) {
  if (key)
    await tx.query(
      "INSERT INTO app_private.command_receipts(actor_id,route,key,request_hash,response_ref) VALUES($1,$2,$3,$4,$5) ON CONFLICT(actor_id,route,key) DO UPDATE SET request_hash=excluded.request_hash,response_ref=excluded.response_ref,expires_at=excluded.expires_at WHERE app_private.command_receipts.expires_at<=now()",
      [actor, route, key, commandHash(input), JSON.stringify(reference)],
    );
}
