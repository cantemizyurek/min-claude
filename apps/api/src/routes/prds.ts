import { Hono } from "hono";
import {
  type Db,
  getProjectById,
  getPrdsByProjectId,
  getPrdById,
  createPrd,
  getMessagesByPrdId,
} from "@min-claude/db";

export function prdRoutes(db: Db) {
  const routes = new Hono();

  // GET /api/projects/:projectId/prds
  routes.get("/", (c) => {
    const projectId = parseInt(c.req.param("projectId") ?? "");
    if (isNaN(projectId)) {
      return c.json({ error: "invalid project id" }, 400);
    }

    const project = getProjectById(db, projectId);
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }

    const prds = getPrdsByProjectId(db, projectId);
    return c.json(prds);
  });

  // POST /api/projects/:projectId/prds
  routes.post("/", async (c) => {
    const projectId = parseInt(c.req.param("projectId") ?? "");
    if (isNaN(projectId)) {
      return c.json({ error: "invalid project id" }, 400);
    }

    const project = getProjectById(db, projectId);
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }

    const body = await c.req.json<{ title?: string }>();
    if (!body.title) {
      return c.json({ error: "title is required" }, 400);
    }

    const prd = createPrd(db, { projectId, title: body.title });
    return c.json(prd, 201);
  });

  // GET /api/projects/:projectId/prds/:prdId/messages
  routes.get("/:prdId/messages", (c) => {
    const projectId = parseInt(c.req.param("projectId") ?? "");
    if (isNaN(projectId)) {
      return c.json({ error: "invalid project id" }, 400);
    }

    const prdId = parseInt(c.req.param("prdId") ?? "");
    if (isNaN(prdId)) {
      return c.json({ error: "invalid prd id" }, 400);
    }

    const project = getProjectById(db, projectId);
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }

    const prd = getPrdById(db, prdId);
    if (!prd || prd.projectId !== projectId) {
      return c.json({ error: "prd not found" }, 404);
    }

    const messages = getMessagesByPrdId(db, prdId);
    return c.json(messages);
  });

  return routes;
}
