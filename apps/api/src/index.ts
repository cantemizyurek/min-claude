import { createDb } from "@min-claude/db";
import { app } from "./app";
import { WsHub } from "./ws/hub";
import { createWsHandler, type WsData } from "./ws/handler";
import { AskUserBridge } from "./agent/ask-user-bridge";

const db = createDb(process.env.DB_PATH);
const hub = new WsHub();
const bridge = new AskUserBridge(hub);
const honoApp = app(db, hub, bridge);
const wsHandler = createWsHandler(db, hub, bridge);

export { hub, bridge };

export default {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  fetch(req: Request, server: import("bun").Server<WsData>) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { subscribedPrdIds: new Set() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return honoApp.fetch(req);
  },
  websocket: wsHandler,
};
