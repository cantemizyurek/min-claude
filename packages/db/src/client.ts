import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

export function createDb(dbPath?: string) {
  const sqlite = new Database(dbPath ?? process.env.DB_PATH ?? "local.db");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
