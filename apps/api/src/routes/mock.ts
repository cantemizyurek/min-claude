/**
 * Mock control routes — only available when MOCK_AGENT=true.
 * Allows E2E tests to register scenarios and control mock behavior.
 */
import { Hono } from "hono";
import {
  registerScenario,
  setActiveScenario,
  resetMock,
  type MockScenario,
} from "../agent/mock-agent-sdk";

export function mockRoutes() {
  const router = new Hono();

  /** POST /api/mock/scenario — register and activate a scenario */
  router.post("/scenario", async (c) => {
    const body = await c.req.json<{ name: string; scenario: MockScenario }>();
    registerScenario(body.name, body.scenario);
    setActiveScenario(body.name);
    return c.json({ ok: true });
  });

  /** POST /api/mock/reset — reset mock state to defaults */
  router.post("/reset", (c) => {
    resetMock();
    return c.json({ ok: true });
  });

  return router;
}
