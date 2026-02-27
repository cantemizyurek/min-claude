import { describe, it, expect, beforeEach } from "bun:test";
import { createDb, type Db } from "./client";
import { projects } from "./schema";
import {
  getAllProjects,
  getProjectById,
  createProject,
  deleteProject,
} from "./queries";

describe("project queries", () => {
  let db: Db;

  beforeEach(() => {
    db = createDb(":memory:");
    db.run(
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
  });

  describe("getAllProjects", () => {
    it("returns empty array when no projects exist", () => {
      const result = getAllProjects(db);
      expect(result).toEqual([]);
    });

    it("returns all projects", () => {
      createProject(db, { name: "Project A", path: "/path/a" });
      createProject(db, { name: "Project B", path: "/path/b" });
      const result = getAllProjects(db);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Project A");
      expect(result[1].name).toBe("Project B");
    });
  });

  describe("getProjectById", () => {
    it("returns undefined for non-existent project", () => {
      const result = getProjectById(db, 999);
      expect(result).toBeUndefined();
    });

    it("returns the project by id", () => {
      const created = createProject(db, {
        name: "Test",
        path: "/test/path",
      });
      const result = getProjectById(db, created.id);
      expect(result).toBeDefined();
      expect(result!.name).toBe("Test");
      expect(result!.path).toBe("/test/path");
    });
  });

  describe("createProject", () => {
    it("creates a project and returns it with an id", () => {
      const result = createProject(db, {
        name: "New Project",
        path: "/new/path",
      });
      expect(result.id).toBeDefined();
      expect(result.name).toBe("New Project");
      expect(result.path).toBe("/new/path");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("auto-increments ids", () => {
      const first = createProject(db, { name: "First", path: "/first" });
      const second = createProject(db, { name: "Second", path: "/second" });
      expect(second.id).toBeGreaterThan(first.id);
    });
  });

  describe("deleteProject", () => {
    it("returns undefined when deleting non-existent project", () => {
      const result = deleteProject(db, 999);
      expect(result).toBeUndefined();
    });

    it("deletes a project and returns it", () => {
      const created = createProject(db, {
        name: "To Delete",
        path: "/delete/me",
      });
      const deleted = deleteProject(db, created.id);
      expect(deleted).toBeDefined();
      expect(deleted!.name).toBe("To Delete");

      const remaining = getAllProjects(db);
      expect(remaining).toHaveLength(0);
    });
  });
});
