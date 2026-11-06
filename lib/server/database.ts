import "server-only";
import { Database } from "../db/types";
import { postgres, embedded } from "../db/adapters";
import { migrate, seedDrafts } from "../db/bootstrap";
const globalDb = globalThis as typeof globalThis & {
  plotrushDb?: Promise<Database>;
};
export function database() {
  globalDb.plotrushDb ??= (async () => {
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.DATABASE_URL || process.env.PREVIEW_MODE !== "true")
    )
      throw new Error(
        "Preview requires DATABASE_URL and PREVIEW_MODE=true. Production content publishing is not available.",
      );
    const db = process.env.DATABASE_URL
      ? await postgres(process.env.DATABASE_URL)
      : await embedded(".plotrush/postgres");
    if (process.env.NODE_ENV !== "production") await migrate(db);
    await seedDrafts(db);
    return db;
  })();
  return globalDb.plotrushDb;
}
