import type { ServerWebSocket } from "bun";
import type { Db } from "@min-claude/db";
import { getMessagesByPrdIdAfter, getPrdById, getProjectById, createMessage } from "@min-claude/db";
import type { WsIncomingMessage, WsOutgoingMessage } from "@min-claude/shared";
import { WsHub } from "./hub";
import type { AskUserBridge } from "../agent/ask-user-bridge";
import { sendMessage, isSessionActive } from "../agent/agent-service";

export interface WsData {
  subscribedPrdIds: Set<number>;
}

export function createWsHandler(db: Db, hub: WsHub, bridge?: AskUserBridge) {
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
      } else if (msg.type === "user_answer" && bridge) {
        // Forward AskUserQuestion answers to the bridge
        bridge.resolveAnswer(msg.prdId, msg.toolUseId, msg.answer);
      } else if (msg.type === "user_message" && bridge) {
        // Handle new user messages — resume the session
        handleUserMessage(db, hub, bridge, msg.prdId, msg.content);
      }
    },

    close(ws: ServerWebSocket<WsData>) {
      hub.removeFromAll(ws);
    },
  };
}

async function handleUserMessage(
  db: Db,
  hub: WsHub,
  bridge: AskUserBridge,
  prdId: number,
  content: string
): Promise<void> {
  if (isSessionActive(prdId)) {
    // Session is already running; ignore (or could queue)
    return;
  }

  const prd = getPrdById(db, prdId);
  if (!prd || !prd.claudeSessionId) return;

  const project = getProjectById(db, prd.projectId);
  if (!project) return;

  sendMessage(prdId, prd.claudeSessionId, content, project.path, {
    db,
    hub,
    bridge,
  });
}
