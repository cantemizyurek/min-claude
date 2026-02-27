import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "@min-claude/db";
import { projectRoutes } from "./routes/projects";
import { prdRoutes } from "./routes/prds";
import { chatRoutes } from "./routes/chat";
import type { WsHub } from "./ws/hub";
import type { AskUserBridge } from "./agent/ask-user-bridge";

export function app(db: Db, hub?: WsHub, bridge?: AskUserBridge) {
  const app = new Hono();

  app.use("/*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/api/projects", projectRoutes(db));
  app.route("/api/projects/:projectId/prds", prdRoutes(db, hub));

  if (hub && bridge) {
    app.route("/api/prds", chatRoutes(db, hub, bridge));
  }

  return app;
}
