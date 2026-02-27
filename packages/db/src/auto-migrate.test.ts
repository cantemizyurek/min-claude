import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDb } from "./client";

describe("auto-migration", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  function getTableNames(dbPath: string): string[] {
    const sqlite = new Database(dbPath);
    const rows = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    sqlite.close();
    return rows.map((r) => r.name);
  }

  it("creates all tables on a fresh in-memory database", () => {
    process.env.NODE_ENV = "development";
    const db = createDb(":memory:");
    const tables = db.run(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    // Use raw SQL to check tables since we have the db instance
    const sqlite = (db as any).$client as Database;
    const rows = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = rows.map((r) => r.name);

    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("prds");
    expect(tableNames).toContain("messages");
  });

  it("is idempotent — second call causes no errors or data loss", () => {
    process.env.NODE_ENV = "development";
    // Use a temp file so both calls access the same database
    const tmpPath = `/tmp/min-claude-test-idempotent-${Date.now()}.db`;

    const db1 = createDb(tmpPath);
    // Insert a project
    db1.run(
      "INSERT INTO projects (name, path, created_at, updated_at) VALUES ('Test', '/test', unixepoch(), unixepoch())",
    );

    // Second call — should not error or lose data
    const db2 = createDb(tmpPath);
    const sqlite2 = (db2 as any).$client as Database;
    const rows = sqlite2
      .query("SELECT name FROM projects")
      .all() as { name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Test");

    // Cleanup
    (db1 as any).$client.close();
    sqlite2.close();
    require("fs").unlinkSync(tmpPath);
  });

  it("does NOT auto-migrate when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    const db = createDb(":memory:");

    const sqlite = (db as any).$client as Database;
    const rows = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = rows.map((r) => r.name);

    // Should have no application tables (no migrations ran)
    expect(tableNames).not.toContain("projects");
    expect(tableNames).not.toContain("prds");
    expect(tableNames).not.toContain("messages");
  });
});
