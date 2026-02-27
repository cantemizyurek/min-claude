import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { projects } from "./schema";

export function getAllProjects(db: Db) {
  return db.select().from(projects).all();
}

export function getProjectById(db: Db, id: number) {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export function createProject(db: Db, data: { name: string; path: string }) {
  return db
    .insert(projects)
    .values({ name: data.name, path: data.path })
    .returning()
    .get();
}

export function deleteProject(db: Db, id: number) {
  return db.delete(projects).where(eq(projects.id, id)).returning().get();
}
