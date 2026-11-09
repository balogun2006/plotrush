// Local test harness only. Production uses Railway PostgreSQL, never this socket server.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { postgres } from "../lib/db/adapters";
import { migrate, seedDrafts } from "../lib/db/bootstrap";
const memory = await PGlite.create();
const server = new PGLiteSocketServer({
  db: memory,
  host: "127.0.0.1",
  port: 5544,
});
await server.start();
const url = "postgresql://postgres:postgres@127.0.0.1:5544/postgres";
const client = await postgres(url);
await migrate(client);
await seedDrafts(client);
// Only the disposable loopback test database receives synthetic staff accounts.
for (const project of ["chromium", "mobile"])
  for (const role of ["editor", "publisher"]) {
    const id = randomUUID();
    await client.query("INSERT INTO app_private.principals(id) VALUES($1)", [
      id,
    ]);
    await client.query(
      "INSERT INTO app_private.accounts(principal_id,email) VALUES($1,$2)",
      [id, `studio-${role}-${project}@example.test`],
    );
    await client.query(
      "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2)",
      [id, [`content_${role}`]],
    );
  }
await client.close();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_MODE: "test",
      PREVIEW_MODE: "true",
      FEATURE_EDITORIAL_PUBLISH: "true",
      FEATURE_PREMIUM_PLAY: "true",
      DATABASE_URL: url,
      APP_URL: "http://127.0.0.1:3000",
      PAYSTACK_ENVIRONMENT: "test",
      PAYSTACK_SECRET_KEY: "sk_test_" + "a".repeat(32),
      PAYSTACK_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
      PAYSTACK_ALLOW_LEGACY_WEBHOOKS: "false",
    },
  },
);
let stopped = false;
async function close(code = 0) {
  if (stopped) return;
  stopped = true;
  child.kill("SIGTERM");
  await server.stop();
  await memory.close();
  process.exit(code);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
child.on("exit", (code) => void close(code ?? 1));
