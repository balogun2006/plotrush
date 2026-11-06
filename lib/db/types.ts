export interface Sql {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Sql {
  transaction<T>(work: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
