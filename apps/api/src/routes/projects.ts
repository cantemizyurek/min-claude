import { Hono } from "hono";
import {
  type Db,
  getAllProjects,
  getProjectById,
  createProject,
  deleteProject,
} from "@min-claude/db";
import { existsSync, statSync } from "fs";
import { join } from "path";

function isGitRepo(dirPath: string): boolean {
  try {
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) return false;
    return existsSync(join(dirPath, ".git"));
  } catch {
    return false;
  }
}

export function projectRoutes(db: Db) {
  const routes = new Hono();

  routes.get("/", (c) => {
    const projects = getAllProjects(db);
    return c.json(projects);
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{ name?: string; path?: string }>();

    if (!body.name || !body.path) {
      return c.json({ error: "name and path are required" }, 400);
    }

    if (!isGitRepo(body.path)) {
      return c.json(
        { error: "path must be a valid directory containing a git repository" },
        400
      );
    }

    const project = createProject(db, { name: body.name, path: body.path });
    return c.json(project, 201);
  });

  routes.delete("/:id", (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "invalid id" }, 400);
    }

    const deleted = deleteProject(db, id);
    if (!deleted) {
      return c.json({ error: "project not found" }, 404);
    }

    return c.json(deleted);
  });

  return routes;
}
