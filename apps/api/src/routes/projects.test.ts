import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { createDb, type Db } from "@min-claude/db";
import { app } from "../app";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "min-claude-test-" + Date.now());
const gitRepoDir = join(testDir, "test-repo");
const nonGitDir = join(testDir, "not-a-repo");

function setup() {
  mkdirSync(gitRepoDir, { recursive: true });
  mkdirSync(join(gitRepoDir, ".git"), { recursive: true });
  mkdirSync(nonGitDir, { recursive: true });
}

function cleanup() {
  rmSync(testDir, { recursive: true, force: true });
}

describe("project routes", () => {
  let db: Db;
  let server: ReturnType<typeof app>;

  beforeEach(() => {
    db = createDb(":memory:");
    db.run(
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
    server = app(db);
    setup();
  });

  afterAll(() => {
    cleanup();
  });

  describe("GET /api/projects", () => {
    it("returns empty array when no projects", async () => {
      const res = await server.request("/api/projects");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns all projects", async () => {
      // Create projects directly
      const createRes1 = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Project A", path: gitRepoDir }),
      });
      expect(createRes1.status).toBe(201);

      const res = await server.request("/api/projects");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Project A");
    });
  });

  describe("POST /api/projects", () => {
    it("creates a project with valid git repo path", async () => {
      const res = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Project", path: gitRepoDir }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe("Test Project");
      expect(data.path).toBe(gitRepoDir);
      expect(data.id).toBeDefined();
    });

    it("returns 400 when name is missing", async () => {
      const res = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: gitRepoDir }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when path is missing", async () => {
      const res = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when path is not a git repo", async () => {
      const res = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", path: nonGitDir }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("git repository");
    });

    it("returns 400 when path does not exist", async () => {
      const res = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", path: "/nonexistent/path" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deletes an existing project", async () => {
      const createRes = await server.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To Delete", path: gitRepoDir }),
      });
      const created = await createRes.json();

      const res = await server.request(`/api/projects/${created.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("To Delete");

      // Verify deletion
      const listRes = await server.request("/api/projects");
      const list = await listRes.json();
      expect(list).toHaveLength(0);
    });

    it("returns 404 for non-existent project", async () => {
      const res = await server.request("/api/projects/999", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid id", async () => {
      const res = await server.request("/api/projects/abc", {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });
  });
});
