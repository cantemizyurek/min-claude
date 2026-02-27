import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "@min-claude/db";
import { projectRoutes } from "./routes/projects";

export function app(db: Db) {
  const app = new Hono();

  app.use("/*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/api/projects", projectRoutes(db));

  return app;
}
