import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "@min-claude/db";
import { projectRoutes } from "./routes/projects";
import { prdRoutes } from "./routes/prds";

export function app(db: Db) {
  const app = new Hono();

  app.use("/*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/api/projects", projectRoutes(db));
  app.route("/api/projects/:projectId/prds", prdRoutes(db));

  return app;
}
