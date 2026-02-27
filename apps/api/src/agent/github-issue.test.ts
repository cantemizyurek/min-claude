import { describe, it, expect, beforeEach } from "bun:test";
import {
  createDb,
  type Db,
  createProject,
  createPrd,
  createMessage,
  getPrdById,
} from "@min-claude/db";
import {
  extractPrdContent,
  createGithubIssue,
  submitPrdAsGithubIssue,
} from "./github-issue";

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

describe("GitHub issue service", () => {
  let db: Db;
  let projectId: number;
  let prdId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    const project = createProject(db, { name: "Test", path: "/test/repo" });
    projectId = project.id;
    const prd = createPrd(db, { projectId, title: "My PRD" });
    prdId = prd.id;
  });

  describe("extractPrdContent", () => {
    it("returns null when no messages exist", () => {
      expect(extractPrdContent(db, prdId)).toBeNull();
    });

    it("returns null when only user messages exist", () => {
      createMessage(db, { prdId, role: "user", content: "Hello" });
      createMessage(db, { prdId, role: "user", content: "More info" });
      expect(extractPrdContent(db, prdId)).toBeNull();
    });

    it("returns the last assistant text message", () => {
      createMessage(db, { prdId, role: "user", content: "Write a PRD" });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "Let me ask some questions first.",
      });
      createMessage(db, { prdId, role: "user", content: "Here are details" });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "# Final PRD\n\n## Problem\nSolve X",
      });

      expect(extractPrdContent(db, prdId)).toBe(
        "# Final PRD\n\n## Problem\nSolve X"
      );
    });

    it("skips AskUserQuestion tool messages (with toolUseId)", () => {
      createMessage(db, {
        prdId,
        role: "assistant",
        content: { type: "ask_user_question", question: "What?" },
        toolUseId: "tool-1",
      });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "# The real PRD content",
      });

      expect(extractPrdContent(db, prdId)).toBe("# The real PRD content");
    });

    it("skips ask_user_question JSON content without toolUseId", () => {
      createMessage(db, {
        prdId,
        role: "assistant",
        content: {
          type: "ask_user_question",
          question: "What?",
          options: [],
        },
      });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "# PRD Document",
      });

      expect(extractPrdContent(db, prdId)).toBe("# PRD Document");
    });

    it("returns null when only tool messages exist", () => {
      createMessage(db, {
        prdId,
        role: "assistant",
        content: { type: "ask_user_question", question: "What?" },
        toolUseId: "tool-1",
      });

      expect(extractPrdContent(db, prdId)).toBeNull();
    });
  });

  describe("createGithubIssue", () => {
    it("parses issue number from gh output", async () => {
      const mockSpawn = (() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                "https://github.com/owner/repo/issues/42\n"
              )
            );
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      const result = await createGithubIssue(
        "Test PRD",
        "# Content",
        "/test/path",
        mockSpawn
      );

      expect(result.issueNumber).toBe(42);
      expect(result.issueUrl).toBe(
        "https://github.com/owner/repo/issues/42"
      );
    });

    it("throws on non-zero exit code", async () => {
      const mockSpawn = (() => ({
        exited: Promise.resolve(1),
        stdout: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("not authenticated")
            );
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      await expect(
        createGithubIssue("Test", "body", "/path", mockSpawn)
      ).rejects.toThrow("gh issue create failed (exit 1): not authenticated");
    });

    it("throws when output cannot be parsed", async () => {
      const mockSpawn = (() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("unexpected output\n")
            );
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      await expect(
        createGithubIssue("Test", "body", "/path", mockSpawn)
      ).rejects.toThrow("Could not parse issue number from gh output");
    });
  });

  describe("submitPrdAsGithubIssue", () => {
    it("extracts content, creates issue, and stores issue number", async () => {
      createMessage(db, { prdId, role: "user", content: "Write a PRD" });
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "# Complete PRD\n\nThis is the PRD.",
      });

      const mockSpawn = (() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                "https://github.com/owner/repo/issues/7\n"
              )
            );
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      const result = await submitPrdAsGithubIssue(
        db,
        prdId,
        "My PRD",
        "/test/repo",
        mockSpawn
      );

      expect(result.issueNumber).toBe(7);
      expect(result.issueUrl).toBe(
        "https://github.com/owner/repo/issues/7"
      );

      // Verify DB was updated
      const prd = getPrdById(db, prdId);
      expect(prd?.githubIssueNumber).toBe(7);
    });

    it("throws when no PRD content is found", async () => {
      const mockSpawn = (() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      await expect(
        submitPrdAsGithubIssue(db, prdId, "My PRD", "/test/repo", mockSpawn)
      ).rejects.toThrow("No PRD content found in conversation messages");
    });

    it("propagates gh command errors", async () => {
      createMessage(db, {
        prdId,
        role: "assistant",
        content: "# PRD content",
      });

      const mockSpawn = (() => ({
        exited: Promise.resolve(1),
        stdout: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("gh: not logged in")
            );
            controller.close();
          },
        }),
      })) as unknown as typeof Bun.spawn;

      await expect(
        submitPrdAsGithubIssue(db, prdId, "My PRD", "/test/repo", mockSpawn)
      ).rejects.toThrow("gh issue create failed");
    });
  });
});
