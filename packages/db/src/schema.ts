import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const prdPhases = ["chat", "issues", "execution", "done"] as const;
export type PrdPhase = (typeof prdPhases)[number];

export const prds = sqliteTable("prds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  phase: text("phase", { enum: prdPhases }).notNull().default("chat"),
  githubIssueNumber: integer("github_issue_number"),
  claudeSessionId: text("claude_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messageRoles = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof messageRoles)[number];

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  prdId: integer("prd_id")
    .notNull()
    .references(() => prds.id, { onDelete: "cascade" }),
  role: text("role", { enum: messageRoles }).notNull(),
  content: text("content", { mode: "json" }).notNull(),
  toolUseId: text("tool_use_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
