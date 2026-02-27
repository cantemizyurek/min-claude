import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import {
  createDb,
  type Db,
  createProject,
  createPrd,
  getMessagesByPrdId,
  getPrdById,
} from "@min-claude/db";
import { WsHub } from "../ws/hub";
import { AskUserBridge } from "./ask-user-bridge";

// Mock the @anthropic-ai/claude-agent-sdk module
const mockQueryFn = mock(() => {});

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQueryFn,
  tool: mock(
    (
      name: string,
      desc: string,
      schema: unknown,
      handler: (...args: unknown[]) => unknown
    ) => ({
      name,
      description: desc,
      schema,
      handler,
    })
  ),
  createSdkMcpServer: mock((opts: unknown) => opts),
}));

// Import after mocking
const { startChatSession, sendMessage, isSessionActive, abortSession, WRITE_PRD_SYSTEM_PROMPT } =
  await import("./agent-service");

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

describe("Agent Service", () => {
  let db: Db;
  let hub: WsHub;
  let bridge: AskUserBridge;
  let projectId: number;
  let prdId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    hub = new WsHub();
    bridge = new AskUserBridge(hub);

    const project = createProject(db, { name: "Test", path: "/test/project" });
    projectId = project.id;
    const prd = createPrd(db, { projectId, title: "Test PRD" });
    prdId = prd.id;

    mockQueryFn.mockReset();
  });

  describe("startChatSession", () => {
    it("stores the initial user message in DB", async () => {
      // Mock query to return an async generator that yields a result immediately
      mockQueryFn.mockImplementation(() => {
        return mockAsyncGenerator([
          {
            type: "system",
            subtype: "init",
            session_id: "test-session-123",
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ]);
      });

      await startChatSession(prdId, "/test/project", "Help me write a PRD", {
        db,
        hub,
        bridge,
      });

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 50));

      const msgs = getMessagesByPrdId(db, prdId);
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      expect(msgs[0].role).toBe("user");
      expect(msgs[0].content).toBe("Help me write a PRD");
    });

    it("broadcasts user message via WebSocket", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Hello Claude", {
        db,
        hub,
        bridge,
      });

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 50));

      // Should have broadcast at least the user message
      const userMsgs = broadcasted.filter(
        (m: any) => m.type === "user_message"
      );
      expect(userMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it("stores session ID in PRD when init message received", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "system",
            subtype: "init",
            session_id: "session-abc-123",
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      await startChatSession(prdId, "/test/project", "Start PRD", {
        db,
        hub,
        bridge,
      });

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 50));

      const prd = getPrdById(db, prdId);
      expect(prd?.claudeSessionId).toBe("session-abc-123");
    });

    it("passes correct options to query()", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      await startChatSession(prdId, "/test/project", "Hello", {
        db,
        hub,
        bridge,
      });

      expect(mockQueryFn).toHaveBeenCalledTimes(1);
      const callArgs = (mockQueryFn.mock.calls as any[][])[0][0] as any;
      expect(callArgs.prompt).toBe("Hello");
      expect(callArgs.options.cwd).toBe("/test/project");
      expect(callArgs.options.systemPrompt).toBe(WRITE_PRD_SYSTEM_PROMPT);
      expect(callArgs.options.model).toBe("claude-sonnet-4-6");
      expect(callArgs.options.allowedTools).toContain("AskUserQuestion");
      expect(callArgs.options.disallowedTools).not.toContain("AskUserQuestion");
      expect(callArgs.options.disallowedTools).toContain("Bash");
      expect(callArgs.options.disallowedTools).toContain("Write");
      expect(callArgs.options.disallowedTools).toContain("Edit");
      expect(callArgs.options.permissionMode).toBe("plan");
    });

    it("throws when session is already active", async () => {
      // First call: make the query hang forever
      mockQueryFn.mockImplementation(() => mockHangingGenerator());

      await startChatSession(prdId, "/test/project", "First", {
        db,
        hub,
        bridge,
      });

      // Second call should throw
      await expect(
        startChatSession(prdId, "/test/project", "Second", {
          db,
          hub,
          bridge,
        })
      ).rejects.toThrow("Session already active");

      // Clean up
      abortSession(prdId);
    });

    it("broadcasts streaming text deltas", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello " },
            },
          },
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "world!" },
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Hello world!",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const textMsgs = broadcasted.filter(
        (m: any) => m.type === "agent_text"
      );
      expect(textMsgs.length).toBe(2);
      expect((textMsgs[0] as any).data.text).toBe("Hello ");
      expect((textMsgs[1] as any).data.text).toBe("world!");
      expect((textMsgs[1] as any).data.accumulated).toBe("Hello world!");
    });

    it("broadcasts thinking deltas via agent_thinking messages", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "thinking_delta", thinking: "Let me " },
            },
          },
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "thinking_delta", thinking: "think about this." },
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const thinkingMsgs = broadcasted.filter(
        (m: any) => m.type === "agent_thinking"
      );
      expect(thinkingMsgs.length).toBe(2);
      expect((thinkingMsgs[0] as any).data.thinking).toBe("Let me ");
      expect((thinkingMsgs[0] as any).data.accumulated).toBe("Let me ");
      expect((thinkingMsgs[1] as any).data.thinking).toBe("think about this.");
      expect((thinkingMsgs[1] as any).data.accumulated).toBe(
        "Let me think about this."
      );
    });

    it("resets accumulated thinking on new assistant message", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "thinking_delta", thinking: "First thought" },
            },
          },
          {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Response 1" }],
            },
          },
          {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "thinking_delta", thinking: "Second thought" },
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const thinkingMsgs = broadcasted.filter(
        (m: any) => m.type === "agent_thinking"
      );
      expect(thinkingMsgs.length).toBe(2);
      // First thinking message accumulates normally
      expect((thinkingMsgs[0] as any).data.accumulated).toBe("First thought");
      // Second thinking message starts fresh (accumulated was reset)
      expect((thinkingMsgs[1] as any).data.accumulated).toBe("Second thought");
    });

    it("broadcasts result message on completion", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Final PRD text",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const resultMsgs = broadcasted.filter(
        (m: any) => m.type === "agent_result"
      );
      expect(resultMsgs.length).toBe(1);
      expect((resultMsgs[0] as any).data.result).toBe("Final PRD text");
      expect((resultMsgs[0] as any).data.isError).toBe(false);
    });

    it("broadcasts assistant messages via WebSocket after saving to DB", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Here is your PRD draft." }],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const assistantBroadcasts = broadcasted.filter(
        (m: any) => m.type === "user_message" && m.data.role === "assistant"
      );
      expect(assistantBroadcasts.length).toBe(1);
      expect((assistantBroadcasts[0] as any).data.content).toBe(
        "Here is your PRD draft."
      );
      // Should include a DB-generated id
      expect((assistantBroadcasts[0] as any).data.id).toBeDefined();
    });

    it("stores assistant messages in DB", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Here is your PRD draft." }],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const msgs = getMessagesByPrdId(db, prdId);
      const assistantMsgs = msgs.filter((m) => m.role === "assistant");
      expect(assistantMsgs.length).toBe(1);
      expect(assistantMsgs[0].content).toBe("Here is your PRD draft.");
    });

    it("broadcasts error on failure", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([], new Error("API error"))
      );

      const broadcasted: unknown[] = [];
      const mockWs = {
        send: (d: string) => broadcasted.push(JSON.parse(d)),
        readyState: 1,
      };
      hub.subscribe(mockWs, prdId);

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      await new Promise((r) => setTimeout(r, 50));

      const errorMsgs = broadcasted.filter(
        (m: any) => m.type === "agent_result" && m.data.isError
      );
      expect(errorMsgs.length).toBe(1);
      expect((errorMsgs[0] as any).data.result).toBe("API error");
    });
  });

  describe("sendMessage", () => {
    it("stores user message and calls query with resume", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      await sendMessage(
        prdId,
        "prev-session-id",
        "Continue the PRD",
        "/test/project",
        { db, hub, bridge }
      );

      await new Promise((r) => setTimeout(r, 50));

      // Check user message stored
      const msgs = getMessagesByPrdId(db, prdId);
      expect(msgs[0].role).toBe("user");
      expect(msgs[0].content).toBe("Continue the PRD");

      // Check query called with resume
      const callArgs = (mockQueryFn.mock.calls as any[][])[0][0] as any;
      expect(callArgs.options.resume).toBe("prev-session-id");
    });

    it("passes correct tool configuration with AskUserQuestion allowed", async () => {
      mockQueryFn.mockImplementation(() =>
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Done",
            is_error: false,
          },
        ])
      );

      await sendMessage(
        prdId,
        "prev-session-id",
        "Continue",
        "/test/project",
        { db, hub, bridge }
      );

      const callArgs = (mockQueryFn.mock.calls as any[][])[0][0] as any;
      expect(callArgs.options.allowedTools).toContain("AskUserQuestion");
      expect(callArgs.options.disallowedTools).not.toContain("AskUserQuestion");
      expect(callArgs.options.disallowedTools).toContain("Bash");
      expect(callArgs.options.disallowedTools).toContain("Write");
      expect(callArgs.options.disallowedTools).toContain("Edit");
    });
  });

  describe("isSessionActive", () => {
    it("returns false when no session is running", () => {
      expect(isSessionActive(prdId)).toBe(false);
    });

    it("returns true while session is running", async () => {
      mockQueryFn.mockImplementation(() => mockHangingGenerator());

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      expect(isSessionActive(prdId)).toBe(true);

      // Clean up
      abortSession(prdId);
    });
  });

  describe("abortSession", () => {
    it("returns false for non-existent session", () => {
      expect(abortSession(999)).toBe(false);
    });

    it("aborts and removes active session", async () => {
      mockQueryFn.mockImplementation(() => mockHangingGenerator());

      await startChatSession(prdId, "/test/project", "Go", {
        db,
        hub,
        bridge,
      });

      expect(isSessionActive(prdId)).toBe(true);
      expect(abortSession(prdId)).toBe(true);
      expect(isSessionActive(prdId)).toBe(false);
    });
  });
});

// ── Test helpers ──

/** Create a mock async generator that yields the given messages then completes. */
function mockAsyncGenerator(
  messages: unknown[],
  error?: Error
): AsyncGenerator<unknown, void> {
  return (async function* () {
    for (const msg of messages) {
      yield msg;
    }
    if (error) throw error;
  })();
}

/** Create a mock async generator that hangs forever (for testing active state). */
function mockHangingGenerator(): AsyncGenerator<unknown, void> & {
  interrupt: () => Promise<void>;
  setPermissionMode: () => Promise<void>;
  setModel: () => Promise<void>;
  setMaxThinkingTokens: () => Promise<void>;
  initializationResult: () => Promise<unknown>;
} {
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const gen = (async function* () {
    await promise;
  })() as any;
  // Add required Query interface methods
  gen.interrupt = async () => { resolve!(); };
  gen.setPermissionMode = async () => {};
  gen.setModel = async () => {};
  gen.setMaxThinkingTokens = async () => {};
  gen.initializationResult = async () => ({});
  return gen;
}
