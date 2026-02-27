import { eq, and, gt } from "drizzle-orm";
import type { Db } from "./client";
import { projects, prds, messages } from "./schema";
import type { PrdPhase, MessageRole } from "./schema";

// ── Project queries ──

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

// ── PRD queries ──

export function getPrdsByProjectId(db: Db, projectId: number) {
  return db
    .select()
    .from(prds)
    .where(eq(prds.projectId, projectId))
    .all();
}

export function getPrdById(db: Db, id: number) {
  return db.select().from(prds).where(eq(prds.id, id)).get();
}

export function createPrd(
  db: Db,
  data: { projectId: number; title: string }
) {
  return db
    .insert(prds)
    .values({ projectId: data.projectId, title: data.title })
    .returning()
    .get();
}

export function updatePrdPhase(db: Db, id: number, phase: PrdPhase) {
  return db
    .update(prds)
    .set({ phase, updatedAt: new Date() })
    .where(eq(prds.id, id))
    .returning()
    .get();
}

export function updatePrdSessionId(db: Db, id: number, sessionId: string) {
  return db
    .update(prds)
    .set({ claudeSessionId: sessionId, updatedAt: new Date() })
    .where(eq(prds.id, id))
    .returning()
    .get();
}

// ── Message queries ──

export function getMessagesByPrdId(db: Db, prdId: number) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.prdId, prdId))
    .all();
}

export function getMessagesByPrdIdAfter(db: Db, prdId: number, afterId: number) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.prdId, prdId), gt(messages.id, afterId)))
    .all();
}

export function createMessage(
  db: Db,
  data: {
    prdId: number;
    role: MessageRole;
    content: unknown;
    toolUseId?: string;
  }
) {
  return db
    .insert(messages)
    .values({
      prdId: data.prdId,
      role: data.role,
      content: data.content,
      toolUseId: data.toolUseId ?? null,
    })
    .returning()
    .get();
}
