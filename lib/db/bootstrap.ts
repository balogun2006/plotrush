import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Database } from "./types";
import { caseSchema } from "../domain/content";
export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(442711)");
    for (const file of [
      "001_foundation.sql",
      "002_rooms.sql",
      "003_accounts_commerce.sql",
      "004_paystack.sql",
      "005_editorial.sql",
      "006_daily.sql",
      "007_refunds.sql",
      "008_disputes.sql",
      "009_refund_recovery.sql",
    ])
      await tx.query(await readFile("db/migrations/" + file, "utf8"));
  });
}
export async function seedDrafts(db: Database) {
  const input = JSON.parse(
    await readFile("docs/implementation/starter_cases.json", "utf8"),
  );
  for (const raw of input.cases) {
    const c = caseSchema.parse(raw),
      json = JSON.stringify(c),
      checksum = createHash("sha256").update(json).digest("hex");
    await db.query(
      "INSERT INTO app_private.case_versions(id,case_key,checksum,content,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [c.key + ":" + checksum, c.key, checksum, json, "draft"],
    );
    await db.query(
      "INSERT INTO app_private.preview_fixtures(version_id) VALUES($1) ON CONFLICT DO NOTHING",
      [c.key + ":" + checksum],
    );
  }
}
