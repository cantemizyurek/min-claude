import { describe, it, expect } from "bun:test";
import { createDb } from "@min-claude/db";
import { app } from "./app";

describe("API with fresh auto-migrated database", () => {
  it("health endpoint responds", async () => {
    const db = createDb(":memory:");
    const server = app(db);
    const res = await server.request("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("GET /api/projects returns empty array on fresh database", async () => {
    const db = createDb(":memory:");
    const server = app(db);
    const res = await server.request("/api/projects");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
