export interface Project {
  id: number;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  path: string;
}

export type PrdPhase = "chat" | "issues" | "execution" | "done";
export type MessageRole = "user" | "assistant" | "system";

export interface Prd {
  id: number;
  projectId: number;
  title: string;
  phase: PrdPhase;
  githubIssueNumber: number | null;
  claudeSessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePrdInput {
  title: string;
}

export interface Message {
  id: number;
  prdId: number;
  role: MessageRole;
  content: unknown;
  toolUseId: string | null;
  createdAt: Date;
}
