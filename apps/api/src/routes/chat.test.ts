import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  createDb,
  type Db,
  createProject,
  createPrd,
  updatePrdPhase,
} from "@min-claude/db";
import { WsHub } from "../ws/hub";
import { AskUserBridge } from "../agent/ask-user-bridge";
import { app } from "../app";

// Mock agent-service module to avoid spawning real Claude processes
mock.module("../agent/agent-service", () => ({
  startChatSession: mock(async () => {}),
  sendMessage: mock(async () => {}),
  isSessionActive: mock(() => false),
  abortSession: mock(() => false),
  WRITE_PRD_SYSTEM_PROMPT: "test prompt",
}));

const { startChatSession, sendMessage, isSessionActive } = await import(
  "../agent/agent-service"
);

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

describe("Chat routes", () => {
  let db: Db;
  let hub: WsHub;
  let bridge: AskUserBridge;
  let server: ReturnType<typeof app>;
  let projectId: number;
  let prdId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    hub = new WsHub();
    bridge = new AskUserBridge(hub);
    server = app(db, hub, bridge);

    const project = createProject(db, {
      name: "Test Project",
      path: "/test/path",
    });
    projectId = project.id;
    const prd = createPrd(db, { projectId, title: "Test PRD" });
    prdId = prd.id;

    (startChatSession as ReturnType<typeof mock>).mockReset();
    (sendMessage as ReturnType<typeof mock>).mockReset();
    (isSessionActive as ReturnType<typeof mock>).mockReset();
    (isSessionActive as ReturnType<typeof mock>).mockImplementation(
      () => false
    );
  });

  describe("POST /api/prds/:prdId/start-chat", () => {
    it("starts a chat session with default message", async () => {
      const res = await server.request(`/api/prds/${prdId}/start-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("started");
      expect(data.prdId).toBe(prdId);
      expect(startChatSession).toHaveBeenCalledTimes(1);
    });

    it("starts a chat session with custom message", async () => {
      const res = await server.request(`/api/prds/${prdId}/start-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Custom starting message" }),
      });

      expect(res.status).toBe(200);
      const args = (startChatSession as ReturnType<typeof mock>).mock
        .calls[0];
      expect(args[2]).toBe("Custom starting message");
    });

    it("returns 404 for non-existent PRD", async () => {
      const res = await server.request("/api/prds/999/start-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("prd not found");
    });

    it("returns 400 for invalid PRD id", async () => {
      const res = await server.request("/api/prds/abc/start-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when PRD is not in chat phase", async () => {
      updatePrdPhase(db, prdId, "issues");

      const res = await server.request(`/api/prds/${prdId}/start-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("prd is not in chat phase");
    });

    it("returns 409 when session is already active", async () => {
      (isSessionActive as ReturnType<typeof mock>).mockImplementation(
        () => true
      );

      const res = await server.request(`/api/prds/${prdId}/start-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("session already active");
    });
  });

  describe("POST /api/prds/:prdId/send-message", () => {
    it("returns 400 when no session exists", async () => {
      const res = await server.request(`/api/prds/${prdId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Continue" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("no session to resume");
    });

    it("returns 400 when message is missing", async () => {
      // Set a session ID on the PRD
      db.run(
        `UPDATE prds SET claude_session_id = 'session-123' WHERE id = ${prdId}`
      );

      const res = await server.request(`/api/prds/${prdId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("message is required");
    });

    it("sends message when session exists", async () => {
      db.run(
        `UPDATE prds SET claude_session_id = 'session-123' WHERE id = ${prdId}`
      );

      const res = await server.request(`/api/prds/${prdId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Continue the PRD" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("sent");
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it("returns 404 for non-existent PRD", async () => {
      const res = await server.request("/api/prds/999/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });

      expect(res.status).toBe(404);
    });
  });
});
