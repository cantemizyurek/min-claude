import { Hono } from "hono";
import { type Db, getPrdById, getProjectById } from "@min-claude/db";
import type { WsHub } from "../ws/hub";
import type { AskUserBridge } from "../agent/ask-user-bridge";
import {
  startChatSession,
  sendMessage,
  isSessionActive,
} from "../agent/agent-service";

export function chatRoutes(db: Db, hub: WsHub, bridge: AskUserBridge) {
  const routes = new Hono();

  // POST /api/prds/:prdId/start-chat
  routes.post("/:prdId/start-chat", async (c) => {
    const prdId = parseInt(c.req.param("prdId") ?? "");
    if (isNaN(prdId)) {
      return c.json({ error: "invalid prd id" }, 400);
    }

    const prd = getPrdById(db, prdId);
    if (!prd) {
      return c.json({ error: "prd not found" }, 404);
    }

    if (prd.phase !== "chat") {
      return c.json({ error: "prd is not in chat phase" }, 400);
    }

    if (isSessionActive(prdId)) {
      return c.json({ error: "session already active" }, 409);
    }

    const project = getProjectById(db, prd.projectId);
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }

    const body = await c.req.json<{ message?: string }>();
    const message =
      body.message || `Help me write a PRD for: ${prd.title}`;

    // Start the chat session (runs in the background)
    startChatSession(prdId, project.path, message, { db, hub, bridge });

    return c.json({ status: "started", prdId }, 200);
  });

  // POST /api/prds/:prdId/send-message
  routes.post("/:prdId/send-message", async (c) => {
    const prdId = parseInt(c.req.param("prdId") ?? "");
    if (isNaN(prdId)) {
      return c.json({ error: "invalid prd id" }, 400);
    }

    const prd = getPrdById(db, prdId);
    if (!prd) {
      return c.json({ error: "prd not found" }, 404);
    }

    if (!prd.claudeSessionId) {
      return c.json({ error: "no session to resume" }, 400);
    }

    if (isSessionActive(prdId)) {
      return c.json({ error: "session already active" }, 409);
    }

    const project = getProjectById(db, prd.projectId);
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }

    const body = await c.req.json<{ message?: string }>();
    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    sendMessage(prdId, prd.claudeSessionId, body.message, project.path, {
      db,
      hub,
      bridge,
    });

    return c.json({ status: "sent", prdId }, 200);
  });

  return routes;
}
