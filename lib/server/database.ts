import "server-only";
import { Database } from "../db/types";
import { postgres, embedded } from "../db/adapters";
import { migrate, seedDrafts } from "../db/bootstrap";
const globalDb = globalThis as typeof globalThis & {
  plotrushDb?: Promise<Database>;
};

async function initialise() {
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.DATABASE_URL || process.env.PREVIEW_MODE !== "true")
  ) {
    console.error(
      JSON.stringify({
        event: "database_config_invalid",
        hasDatabaseURL: Boolean(process.env.DATABASE_URL),
        previewEnabled: process.env.PREVIEW_MODE === "true",
      }),
    );
    throw new Error(
      "Deployed preview requires PostgreSQL and PREVIEW_MODE=true.",
    );
  }
  const db = process.env.DATABASE_URL
    ? await postgres(process.env.DATABASE_URL)
    : await embedded(".plotrush/postgres");
  try {
    await db.query("SELECT 1");
    if (!production) await migrate(db);
    await seedDrafts(db);
    return db;
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
}
export function database(): Promise<Database> {
  globalDb.plotrushDb ??= initialise().catch((error) => {
    // A transient database outage must not poison this process until redeployment.
    globalDb.plotrushDb = undefined;
    const code = (error as { code?: unknown })?.code;
    console.error(
      JSON.stringify({
        event: "database_initialisation_failed",
        sqlState:
          typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null,
        errorType:
          error instanceof Error
            ? error.name.replace(/[^a-zA-Z]/g, "").slice(0, 40)
            : "Unknown",
      }),
    );
    throw error;
  });
  return globalDb.plotrushDb;
}
