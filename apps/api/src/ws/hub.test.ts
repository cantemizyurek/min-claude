import { describe, it, expect, beforeEach } from "bun:test";
import { WsHub, type WsConnection } from "./hub";
import type { WsOutgoingMessage } from "@min-claude/shared";

/** Create a mock WebSocket connection that records sent messages. */
function mockWs(readyState = 1): WsConnection & { sent: string[] } {
  const sent: string[] = [];
  return {
    readyState,
    sent,
    send(data: string) {
      sent.push(data);
    },
  };
}

describe("WsHub", () => {
  let hub: WsHub;

  beforeEach(() => {
    hub = new WsHub();
  });

  describe("subscribe / unsubscribe", () => {
    it("tracks subscriber count after subscribe", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);
      expect(hub.getSubscriberCount(1)).toBe(1);
    });

    it("tracks multiple subscribers on the same channel", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      hub.subscribe(ws1, 1);
      hub.subscribe(ws2, 1);
      expect(hub.getSubscriberCount(1)).toBe(2);
    });

    it("tracks subscribers across different channels", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      hub.subscribe(ws1, 1);
      hub.subscribe(ws2, 2);
      expect(hub.getSubscriberCount(1)).toBe(1);
      expect(hub.getSubscriberCount(2)).toBe(1);
      expect(hub.getChannelCount()).toBe(2);
    });

    it("removes subscriber on unsubscribe", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);
      expect(hub.getSubscriberCount(1)).toBe(1);
      hub.unsubscribe(ws, 1);
      expect(hub.getSubscriberCount(1)).toBe(0);
    });

    it("cleans up empty channels after unsubscribe", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);
      hub.unsubscribe(ws, 1);
      expect(hub.getChannelCount()).toBe(0);
    });

    it("does not error when unsubscribing from non-existent channel", () => {
      const ws = mockWs();
      expect(() => hub.unsubscribe(ws, 999)).not.toThrow();
    });

    it("does not double-count the same connection", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);
      hub.subscribe(ws, 1);
      expect(hub.getSubscriberCount(1)).toBe(1);
    });
  });

  describe("removeFromAll", () => {
    it("removes connection from all channels", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);
      hub.subscribe(ws, 2);
      hub.subscribe(ws, 3);
      expect(hub.getChannelCount()).toBe(3);

      hub.removeFromAll(ws);
      expect(hub.getSubscriberCount(1)).toBe(0);
      expect(hub.getSubscriberCount(2)).toBe(0);
      expect(hub.getSubscriberCount(3)).toBe(0);
      expect(hub.getChannelCount()).toBe(0);
    });

    it("does not affect other connections", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      hub.subscribe(ws1, 1);
      hub.subscribe(ws2, 1);

      hub.removeFromAll(ws1);
      expect(hub.getSubscriberCount(1)).toBe(1);
    });
  });

  describe("broadcast", () => {
    it("sends message to all subscribers of a channel", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      hub.subscribe(ws1, 1);
      hub.subscribe(ws2, 1);

      const msg: WsOutgoingMessage = {
        type: "agent_text",
        prdId: 1,
        data: { text: "hello" },
      };
      hub.broadcast(1, msg);

      expect(ws1.sent).toHaveLength(1);
      expect(ws2.sent).toHaveLength(1);
      expect(JSON.parse(ws1.sent[0])).toEqual(msg);
      expect(JSON.parse(ws2.sent[0])).toEqual(msg);
    });

    it("does not send to subscribers of other channels", () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      hub.subscribe(ws1, 1);
      hub.subscribe(ws2, 2);

      const msg: WsOutgoingMessage = {
        type: "user_message",
        prdId: 1,
        data: { text: "hello" },
      };
      hub.broadcast(1, msg);

      expect(ws1.sent).toHaveLength(1);
      expect(ws2.sent).toHaveLength(0);
    });

    it("does not send to connections with non-open readyState", () => {
      const wsOpen = mockWs(1);
      const wsClosed = mockWs(3);
      hub.subscribe(wsOpen, 1);
      hub.subscribe(wsClosed, 1);

      const msg: WsOutgoingMessage = {
        type: "agent_result",
        prdId: 1,
        data: { result: "done" },
      };
      hub.broadcast(1, msg);

      expect(wsOpen.sent).toHaveLength(1);
      expect(wsClosed.sent).toHaveLength(0);
    });

    it("does nothing when broadcasting to a channel with no subscribers", () => {
      const msg: WsOutgoingMessage = {
        type: "status_change",
        prdId: 999,
        data: { phase: "issues" },
      };
      expect(() => hub.broadcast(999, msg)).not.toThrow();
    });

    it("broadcasts different message types correctly", () => {
      const ws = mockWs();
      hub.subscribe(ws, 1);

      const types = [
        "agent_text",
        "agent_tool_use",
        "agent_result",
        "user_message",
        "status_change",
      ] as const;

      for (const type of types) {
        hub.broadcast(1, { type, prdId: 1, data: { type } });
      }

      expect(ws.sent).toHaveLength(5);
      for (let i = 0; i < types.length; i++) {
        const parsed = JSON.parse(ws.sent[i]);
        expect(parsed.type).toBe(types[i]);
      }
    });
  });
});
