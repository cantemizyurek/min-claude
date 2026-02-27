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

// ── WebSocket types ──

export type WsMessageType =
  | "agent_text"
  | "agent_thinking"
  | "agent_tool_use"
  | "agent_result"
  | "user_message"
  | "status_change";

export interface WsOutgoingMessage {
  type: WsMessageType;
  prdId: number;
  data: unknown;
}

/** Client → Server: subscribe to a PRD channel, optionally replay from lastMessageId */
export interface WsSubscribeMessage {
  type: "subscribe";
  prdId: number;
  lastMessageId?: number;
}

/** Client → Server: unsubscribe from a PRD channel */
export interface WsUnsubscribeMessage {
  type: "unsubscribe";
  prdId: number;
}

/** Client → Server: answer to an AskUserQuestion tool call */
export interface WsUserAnswerMessage {
  type: "user_answer";
  prdId: number;
  toolUseId: string;
  answer: string;
}

/** Client → Server: new user message in the conversation */
export interface WsUserChatMessage {
  type: "user_message";
  prdId: number;
  content: string;
}

export type WsIncomingMessage =
  | WsSubscribeMessage
  | WsUnsubscribeMessage
  | WsUserAnswerMessage
  | WsUserChatMessage;

// ── AskUserQuestion types ──

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestionData {
  toolUseId: string;
  question: string;
  options: AskUserQuestionOption[];
}
