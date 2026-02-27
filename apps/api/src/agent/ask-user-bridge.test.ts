import { describe, it, expect, beforeEach } from "bun:test";
import { AskUserBridge } from "./ask-user-bridge";
import { WsHub } from "../ws/hub";

describe("AskUserBridge", () => {
  let hub: WsHub;
  let bridge: AskUserBridge;

  beforeEach(() => {
    hub = new WsHub();
    bridge = new AskUserBridge(hub);
  });

  describe("askUser", () => {
    it("broadcasts the question via WebSocket", async () => {
      const broadcasted: unknown[] = [];
      const mockWs = { send: (d: string) => broadcasted.push(JSON.parse(d)), readyState: 1 };
      hub.subscribe(mockWs, 1);

      // Start asking — don't await yet
      const answerPromise = bridge.askUser(1, "tool-1", "What is the project name?", [
        { label: "Option A", description: "First option" },
      ]);

      // Verify broadcast happened
      expect(broadcasted).toHaveLength(1);
      expect(broadcasted[0]).toEqual({
        type: "agent_tool_use",
        prdId: 1,
        data: {
          toolUseId: "tool-1",
          question: "What is the project name?",
          options: [{ label: "Option A", description: "First option" }],
        },
      });

      // Resolve with an answer
      bridge.resolveAnswer(1, "tool-1", "My Project");
      const answer = await answerPromise;
      expect(answer).toBe("My Project");
    });

    it("returns false when resolving a non-existent question", () => {
      const result = bridge.resolveAnswer(1, "nonexistent", "answer");
      expect(result).toBe(false);
    });

    it("tracks pending count correctly", async () => {
      const mockWs = { send: () => {}, readyState: 1 };
      hub.subscribe(mockWs, 1);

      expect(bridge.pendingCount).toBe(0);

      const p1 = bridge.askUser(1, "t1", "Q1", []);
      expect(bridge.pendingCount).toBe(1);

      const p2 = bridge.askUser(1, "t2", "Q2", []);
      expect(bridge.pendingCount).toBe(2);

      bridge.resolveAnswer(1, "t1", "A1");
      await p1;
      expect(bridge.pendingCount).toBe(1);

      bridge.resolveAnswer(1, "t2", "A2");
      await p2;
      expect(bridge.pendingCount).toBe(0);
    });
  });

  describe("hasPending", () => {
    it("returns true when questions are pending for a PRD", () => {
      const mockWs = { send: () => {}, readyState: 1 };
      hub.subscribe(mockWs, 1);

      expect(bridge.hasPending(1)).toBe(false);
      bridge.askUser(1, "t1", "Q?", []);
      expect(bridge.hasPending(1)).toBe(true);
      expect(bridge.hasPending(2)).toBe(false);
    });
  });

  describe("cancelAll", () => {
    it("rejects all pending questions for a PRD", async () => {
      const mockWs = { send: () => {}, readyState: 1 };
      hub.subscribe(mockWs, 1);
      hub.subscribe(mockWs, 2);

      const p1 = bridge.askUser(1, "t1", "Q1", []);
      const p2 = bridge.askUser(1, "t2", "Q2", []);
      const p3 = bridge.askUser(2, "t3", "Q3", []);

      bridge.cancelAll(1);

      // PRD 1 questions should reject
      await expect(p1).rejects.toThrow("Session cancelled");
      await expect(p2).rejects.toThrow("Session cancelled");

      // PRD 2 should still be pending
      expect(bridge.hasPending(2)).toBe(true);

      // Clean up
      bridge.resolveAnswer(2, "t3", "A3");
      await p3;
    });
  });
});
