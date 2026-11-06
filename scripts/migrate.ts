import { postgres, embedded } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
const db = process.env.DATABASE_URL
  ? await postgres(process.env.DATABASE_URL)
  : await embedded(".plotrush/postgres");
try {
  await migrate(db);
  if (
    process.env.PREVIEW_MODE === "true" ||
    process.env.NODE_ENV !== "production"
  )
    await seedDrafts(db);
  console.log("Schema ready; draft preview content imported.");
} finally {
  await db.close();
}
