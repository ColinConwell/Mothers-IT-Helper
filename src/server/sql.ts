import type Database from "better-sqlite3";

export type Sql = {
  query: <T>(sql: string, params?: unknown[]) => T[];
  exec: (sql: string, params?: unknown[]) => { rowsRead: number; rowsWritten: number };
};

export function makeSql(db: Database.Database): Sql {
  return {
    query: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
    exec: (sql: string, params: unknown[] = []) => {
      const info = db.prepare(sql).run(...params);
      return { rowsRead: 0, rowsWritten: info.changes };
    },
  };
}
