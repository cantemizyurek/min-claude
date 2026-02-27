import { describe, it, expect, beforeEach } from "bun:test";
import { createDb, type Db, createProject, createPrd, createMessage } from "@min-claude/db";
import { app } from "../app";

function createTables(db: Db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS prds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'chat',
      github_issue_number INTEGER,
      claude_session_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prd_id INTEGER NOT NULL REFERENCES prds(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_use_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`
  );
}

describe("PRD routes", () => {
  let db: Db;
  let server: ReturnType<typeof app>;
  let projectId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    server = app(db);

    // Create a project directly in the DB for testing
    const project = createProject(db, { name: "Test Project", path: "/test" });
    projectId = project.id;
  });

  describe("GET /api/projects/:projectId/prds", () => {
    it("returns empty array when no PRDs exist", async () => {
      const res = await server.request(`/api/projects/${projectId}/prds`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns PRDs for a project", async () => {
      // Create a PRD first
      await server.request(`/api/projects/${projectId}/prds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test PRD" }),
      });

      const res = await server.request(`/api/projects/${projectId}/prds`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("Test PRD");
      expect(data[0].phase).toBe("chat");
    });

    it("returns 404 for non-existent project", async () => {
      const res = await server.request("/api/projects/999/prds");
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("project not found");
    });

    it("returns 400 for invalid project id", async () => {
      const res = await server.request("/api/projects/abc/prds");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("invalid project id");
    });
  });

  describe("POST /api/projects/:projectId/prds", () => {
    it("creates a PRD with valid title", async () => {
      const res = await server.request(`/api/projects/${projectId}/prds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New PRD" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe("New PRD");
      expect(data.phase).toBe("chat");
      expect(data.projectId).toBe(projectId);
      expect(data.id).toBeDefined();
    });

    it("returns 400 when title is missing", async () => {
      const res = await server.request(`/api/projects/${projectId}/prds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("title is required");
    });

    it("returns 404 for non-existent project", async () => {
      const res = await server.request("/api/projects/999/prds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("project not found");
    });

    it("returns 400 for invalid project id", async () => {
      const res = await server.request("/api/projects/abc/prds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/projects/:projectId/prds/:prdId/messages", () => {
    let prdId: number;

    beforeEach(() => {
      const prd = createPrd(db, { projectId, title: "Chat PRD" });
      prdId = prd.id;
    });

    it("returns empty array when no messages exist", async () => {
      const res = await server.request(
        `/api/projects/${projectId}/prds/${prdId}/messages`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns messages for a PRD", async () => {
      createMessage(db, { prdId, role: "user", content: "Hello" });
      createMessage(db, { prdId, role: "assistant", content: "Hi there" });

      const res = await server.request(
        `/api/projects/${projectId}/prds/${prdId}/messages`
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(data[0].role).toBe("user");
      expect(data[0].content).toBe("Hello");
      expect(data[1].role).toBe("assistant");
      expect(data[1].content).toBe("Hi there");
    });

    it("returns 404 for non-existent project", async () => {
      const res = await server.request(
        `/api/projects/999/prds/${prdId}/messages`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("project not found");
    });

    it("returns 404 for non-existent PRD", async () => {
      const res = await server.request(
        `/api/projects/${projectId}/prds/999/messages`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("prd not found");
    });

    it("returns 404 when PRD belongs to different project", async () => {
      const otherProject = createProject(db, {
        name: "Other",
        path: "/other",
      });
      const res = await server.request(
        `/api/projects/${otherProject.id}/prds/${prdId}/messages`
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("prd not found");
    });

    it("returns 400 for invalid prd id", async () => {
      const res = await server.request(
        `/api/projects/${projectId}/prds/abc/messages`
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("invalid prd id");
    });
  });
});
