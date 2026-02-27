import { describe, it, expect, beforeEach } from "bun:test";
import { createDb, type Db } from "./client";
import {
  createProject,
  createPrd,
  getPrdsByProjectId,
  getPrdById,
  updatePrdPhase,
  createMessage,
  getMessagesByPrdId,
} from "./queries";

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

describe("PRD queries", () => {
  let db: Db;
  let projectId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    const project = createProject(db, { name: "Test Project", path: "/test" });
    projectId = project.id;
  });

  describe("getPrdsByProjectId", () => {
    it("returns empty array when no PRDs exist", () => {
      const result = getPrdsByProjectId(db, projectId);
      expect(result).toEqual([]);
    });

    it("returns PRDs for a project", () => {
      createPrd(db, { projectId, title: "PRD A" });
      createPrd(db, { projectId, title: "PRD B" });
      const result = getPrdsByProjectId(db, projectId);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("PRD A");
      expect(result[1].title).toBe("PRD B");
    });

    it("does not return PRDs from other projects", () => {
      const other = createProject(db, { name: "Other", path: "/other" });
      createPrd(db, { projectId, title: "Mine" });
      createPrd(db, { projectId: other.id, title: "Theirs" });
      const result = getPrdsByProjectId(db, projectId);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Mine");
    });
  });

  describe("getPrdById", () => {
    it("returns undefined for non-existent PRD", () => {
      const result = getPrdById(db, 999);
      expect(result).toBeUndefined();
    });

    it("returns the PRD by id", () => {
      const created = createPrd(db, { projectId, title: "Test PRD" });
      const result = getPrdById(db, created.id);
      expect(result).toBeDefined();
      expect(result!.title).toBe("Test PRD");
      expect(result!.projectId).toBe(projectId);
    });
  });

  describe("createPrd", () => {
    it("creates a PRD with default phase 'chat'", () => {
      const result = createPrd(db, { projectId, title: "New PRD" });
      expect(result.id).toBeDefined();
      expect(result.title).toBe("New PRD");
      expect(result.phase).toBe("chat");
      expect(result.projectId).toBe(projectId);
      expect(result.githubIssueNumber).toBeNull();
      expect(result.claudeSessionId).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("auto-increments ids", () => {
      const first = createPrd(db, { projectId, title: "First" });
      const second = createPrd(db, { projectId, title: "Second" });
      expect(second.id).toBeGreaterThan(first.id);
    });
  });

  describe("updatePrdPhase", () => {
    it("updates the phase of a PRD", () => {
      const created = createPrd(db, { projectId, title: "Phase Test" });
      expect(created.phase).toBe("chat");

      const updated = updatePrdPhase(db, created.id, "issues");
      expect(updated).toBeDefined();
      expect(updated!.phase).toBe("issues");
    });

    it("returns undefined for non-existent PRD", () => {
      const result = updatePrdPhase(db, 999, "done");
      expect(result).toBeUndefined();
    });
  });
});

describe("message queries", () => {
  let db: Db;
  let prdId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    const project = createProject(db, { name: "Test", path: "/test" });
    const prd = createPrd(db, { projectId: project.id, title: "Test PRD" });
    prdId = prd.id;
  });

  describe("getMessagesByPrdId", () => {
    it("returns empty array when no messages exist", () => {
      const result = getMessagesByPrdId(db, prdId);
      expect(result).toEqual([]);
    });

    it("returns messages for a PRD", () => {
      createMessage(db, { prdId, role: "user", content: { text: "hello" } });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: { text: "hi there" },
      });
      const result = getMessagesByPrdId(db, prdId);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });

    it("does not return messages from other PRDs", () => {
      const project = createProject(db, { name: "Other", path: "/other" });
      const otherPrd = createPrd(db, {
        projectId: project.id,
        title: "Other",
      });
      createMessage(db, { prdId, role: "user", content: { text: "mine" } });
      createMessage(db, {
        prdId: otherPrd.id,
        role: "user",
        content: { text: "theirs" },
      });
      const result = getMessagesByPrdId(db, prdId);
      expect(result).toHaveLength(1);
    });
  });

  describe("createMessage", () => {
    it("creates a message with required fields", () => {
      const result = createMessage(db, {
        prdId,
        role: "user",
        content: { text: "hello world" },
      });
      expect(result.id).toBeDefined();
      expect(result.prdId).toBe(prdId);
      expect(result.role).toBe("user");
      expect(result.content).toEqual({ text: "hello world" });
      expect(result.toolUseId).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("creates a message with toolUseId", () => {
      const result = createMessage(db, {
        prdId,
        role: "assistant",
        content: { type: "tool_use" },
        toolUseId: "tool_123",
      });
      expect(result.toolUseId).toBe("tool_123");
    });

    it("stores JSON content correctly", () => {
      const complexContent = {
        blocks: [
          { type: "text", text: "Hello" },
          { type: "tool_use", id: "abc", name: "ask", input: { q: "?" } },
        ],
      };
      const result = createMessage(db, {
        prdId,
        role: "assistant",
        content: complexContent,
      });
      expect(result.content).toEqual(complexContent);
    });
  });
});
