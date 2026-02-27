import { Hono } from "hono";
import {
  type Db,
  getProjectById,
  getPrdsByProjectId,
  getPrdById,
  createPrd,
  getMessagesByPrdId,
  updatePrdPhase,
} from "@min-claude/db";
import type { PrdPhase } from "@min-claude/shared";
import type { WsHub } from "../ws/hub";
import { submitPrdAsGithubIssue } from "../agent/github-issue";

/** Allowed phase transitions: from → to[] */
const VALID_TRANSITIONS: Record<string, string[]> = {
  chat: ["issues"],
  issues: ["execution"],
  execution: ["done"],
};

export function prdRoutes(db: Db, hub?: WsHub) {
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

  // PATCH /api/projects/:projectId/prds/:prdId/phase
  routes.patch("/:prdId/phase", async (c) => {
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

    const body = await c.req.json<{ phase?: string }>();
    if (!body.phase) {
      return c.json({ error: "phase is required" }, 400);
    }

    const allowed = VALID_TRANSITIONS[prd.phase];
    if (!allowed || !allowed.includes(body.phase)) {
      return c.json(
        {
          error: `invalid phase transition from '${prd.phase}' to '${body.phase}'`,
        },
        400
      );
    }

    const updated = updatePrdPhase(db, prdId, body.phase as PrdPhase);

    // When transitioning from chat → issues, submit PRD as a GitHub issue
    let githubIssue: { issueNumber: number; issueUrl: string } | null = null;
    if (prd.phase === "chat" && body.phase === "issues") {
      try {
        githubIssue = await submitPrdAsGithubIssue(
          db,
          prdId,
          prd.title,
          project.path
        );
      } catch {
        // GitHub issue creation is best-effort — don't block the phase transition
      }
    }

    // Notify subscribers of the phase change
    if (hub) {
      hub.broadcast(prdId, {
        type: "status_change",
        prdId,
        data: {
          phase: updated.phase,
          ...(githubIssue && { githubIssueUrl: githubIssue.issueUrl }),
        },
      });
    }

    return c.json({
      ...updated,
      ...(githubIssue && {
        githubIssueNumber: githubIssue.issueNumber,
        githubIssueUrl: githubIssue.issueUrl,
      }),
    });
  });

  return routes;
}
