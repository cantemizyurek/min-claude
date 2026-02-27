import type { ServerWebSocket } from "bun";
import type { Db } from "@min-claude/db";
import { getMessagesByPrdIdAfter } from "@min-claude/db";
import type { WsIncomingMessage, WsOutgoingMessage } from "@min-claude/shared";
import { WsHub } from "./hub";

export interface WsData {
  subscribedPrdIds: Set<number>;
}

export function createWsHandler(db: Db, hub: WsHub) {
  return {
    open(ws: ServerWebSocket<WsData>) {
      ws.data.subscribedPrdIds = new Set();
    },

    message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      let msg: WsIncomingMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      if (msg.type === "subscribe") {
        hub.subscribe(ws, msg.prdId);
        ws.data.subscribedPrdIds.add(msg.prdId);

        // Reconnection: replay missed messages
        if (msg.lastMessageId != null) {
          const missed = getMessagesByPrdIdAfter(db, msg.prdId, msg.lastMessageId);
          for (const m of missed) {
            const outgoing: WsOutgoingMessage = {
              type: "user_message",
              prdId: msg.prdId,
              data: m,
            };
            ws.send(JSON.stringify(outgoing));
          }
        }
      } else if (msg.type === "unsubscribe") {
        hub.unsubscribe(ws, msg.prdId);
        ws.data.subscribedPrdIds.delete(msg.prdId);
      }
    },

    close(ws: ServerWebSocket<WsData>) {
      hub.removeFromAll(ws);
    },
  };
}
