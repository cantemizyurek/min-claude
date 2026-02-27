import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "path";
import * as schema from "./schema";

const defaultMigrationsFolder = resolve(import.meta.dir, "../drizzle");

export function createDb(
  dbPath?: string,
  options?: { migrationsFolder?: string },
) {
  const sqlite = new Database(dbPath ?? process.env.DB_PATH ?? "local.db");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });

  if (process.env.NODE_ENV !== "production") {
    migrate(db, {
      migrationsFolder: options?.migrationsFolder ?? defaultMigrationsFolder,
    });
  }

  return db;
}

export type Db = ReturnType<typeof createDb>;
