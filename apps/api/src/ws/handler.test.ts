import { describe, it, expect, beforeEach } from "bun:test";
import { createDb, type Db, createProject, createPrd, createMessage } from "@min-claude/db";
import { WsHub } from "./hub";
import { createWsHandler } from "./handler";

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

/** Minimal mock that satisfies ServerWebSocket<WsData> for handler tests. */
function mockServerWs() {
  const sent: string[] = [];
  return {
    readyState: 1,
    sent,
    send(data: string) {
      sent.push(data);
    },
    data: { subscribedPrdIds: new Set<number>() },
  };
}

describe("WebSocket handler", () => {
  let db: Db;
  let hub: WsHub;
  let handler: ReturnType<typeof createWsHandler>;
  let prdId: number;

  beforeEach(() => {
    db = createDb(":memory:");
    createTables(db);
    hub = new WsHub();
    handler = createWsHandler(db, hub);

    const project = createProject(db, { name: "Test", path: "/test" });
    const prd = createPrd(db, { projectId: project.id, title: "Test PRD" });
    prdId = prd.id;
  });

  it("subscribes client on subscribe message", () => {
    const ws = mockServerWs();
    handler.open(ws as any);
    handler.message(ws as any, JSON.stringify({ type: "subscribe", prdId }));

    expect(hub.getSubscriberCount(prdId)).toBe(1);
    expect(ws.data.subscribedPrdIds.has(prdId)).toBe(true);
  });

  it("unsubscribes client on unsubscribe message", () => {
    const ws = mockServerWs();
    handler.open(ws as any);
    handler.message(ws as any, JSON.stringify({ type: "subscribe", prdId }));
    handler.message(ws as any, JSON.stringify({ type: "unsubscribe", prdId }));

    expect(hub.getSubscriberCount(prdId)).toBe(0);
    expect(ws.data.subscribedPrdIds.has(prdId)).toBe(false);
  });

  it("removes client from all channels on close", () => {
    const ws = mockServerWs();
    handler.open(ws as any);
    handler.message(ws as any, JSON.stringify({ type: "subscribe", prdId }));

    handler.close(ws as any);
    expect(hub.getSubscriberCount(prdId)).toBe(0);
  });

  it("sends error for invalid JSON", () => {
    const ws = mockServerWs();
    handler.open(ws as any);
    handler.message(ws as any, "not json");

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ error: "invalid JSON" });
  });

  it("replays missed messages on subscribe with lastMessageId", () => {
    // Create some messages in the DB
    const m1 = createMessage(db, { prdId, role: "user", content: { text: "first" } });
    const m2 = createMessage(db, { prdId, role: "assistant", content: { text: "second" } });
    const m3 = createMessage(db, { prdId, role: "user", content: { text: "third" } });

    const ws = mockServerWs();
    handler.open(ws as any);

    // Subscribe with lastMessageId = m1.id, should replay m2 and m3
    handler.message(
      ws as any,
      JSON.stringify({ type: "subscribe", prdId, lastMessageId: m1.id })
    );

    // Should have received 2 replayed messages
    expect(ws.sent).toHaveLength(2);

    const replayed1 = JSON.parse(ws.sent[0]);
    expect(replayed1.type).toBe("user_message");
    expect(replayed1.prdId).toBe(prdId);
    expect(replayed1.data.content).toEqual({ text: "second" });

    const replayed2 = JSON.parse(ws.sent[1]);
    expect(replayed2.data.content).toEqual({ text: "third" });
  });

  it("does not replay messages when subscribing without lastMessageId", () => {
    createMessage(db, { prdId, role: "user", content: { text: "existing" } });

    const ws = mockServerWs();
    handler.open(ws as any);
    handler.message(ws as any, JSON.stringify({ type: "subscribe", prdId }));

    expect(ws.sent).toHaveLength(0);
  });
});
