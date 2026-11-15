import { readFile } from "node:fs/promises";
import { postgres } from "../lib/db/adapters";
import { retentionSweep, replayDeletionLedger } from "../lib/domain/privacy";
if (!process.env.DATABASE_URL)
  throw Error("Private database connection required.");
const db = await postgres(process.env.DATABASE_URL);
try {
  const index = process.argv.indexOf("--replay-ledger");
  if (index >= 0) {
    if (!process.argv.includes("--execute") || !process.argv[index + 1])
      throw Error(
        "Ledger replay requires an explicit file and --execute on an isolated restore.",
      );
    console.log(
      JSON.stringify(
        await replayDeletionLedger(
          db,
          JSON.parse(await readFile(process.argv[index + 1], "utf8")),
        ),
      ),
    );
  } else
    console.log(
      JSON.stringify(
        await retentionSweep(
          db,
          process.env.PRIVACY_RETENTION_REFERENCE ?? "",
          process.env.PRIVACY_BACKUP_PROCESS_REFERENCE ?? "",
          !process.argv.includes("--execute"),
        ),
      ),
    );
} finally {
  await db.close();
}
