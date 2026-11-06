import { Database, Sql } from "./types";
export async function postgres(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: process.env.APP_MODE === "test" ? 1 : 8,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    transaction: async (work) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Sql = {
          query: async <T>(sql: string, params?: unknown[]) => ({
            rows: (await client.query(sql, params)).rows as T[],
          }),
        };
        const r = await work(tx);
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function embedded(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dataDir);
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      if (!params && sql.includes(";")) {
        await db.exec(sql);
        return { rows: [] as T[] };
      }
      return { rows: (await db.query(sql, params)).rows as T[] };
    },
    transaction: (work) =>
      db.transaction((tx) =>
        work({
          query: async <T>(sql: string, params?: unknown[]) => {
            if (!params && sql.includes(";")) {
              await tx.exec(sql);
              return { rows: [] as T[] };
            }
            return { rows: (await tx.query(sql, params)).rows as T[] };
          },
        }),
      ),
    close: () => db.close(),
  };
}
