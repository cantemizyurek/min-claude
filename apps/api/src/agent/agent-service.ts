import {
  query,
  tool,
  createSdkMcpServer,
  type SDKMessage,
  type SDKResultMessage,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Db } from "@min-claude/db";
import { createMessage, updatePrdSessionId } from "@min-claude/db";
import type { WsOutgoingMessage } from "@min-claude/shared";
import type { WsHub } from "../ws/hub";
import type { AskUserBridge } from "./ask-user-bridge";

const WRITE_PRD_SYSTEM_PROMPT = `You are an expert product requirements document (PRD) writer. Your job is to collaboratively write a comprehensive PRD with the user.

You MUST use the AskUserQuestion tool to ask the user clarifying questions about their project. Ask questions one at a time to gather requirements iteratively.

Key areas to cover in the PRD:
- Problem statement and motivation
- Target users and use cases
- Proposed solution and key features
- Technical requirements and constraints
- Success metrics and acceptance criteria
- Out of scope items

When you have gathered enough information, synthesize everything into a well-structured PRD document.

Guidelines:
- Ask focused, specific questions
- Provide option suggestions when relevant
- Build on previous answers
- Be concise but thorough
- Use markdown formatting for the final PRD`;

/** Active query handles keyed by prdId, so we can track running sessions. */
const activeSessions = new Map<
  number,
  { query: Query; abortController: AbortController }
>();

export interface AgentServiceDeps {
  db: Db;
  hub: WsHub;
  bridge: AskUserBridge;
}

/**
 * Start a new chat session for a PRD.
 * Creates a Claude Agent SDK query with a custom AskUserQuestion MCP tool,
 * streams messages to the frontend via WebSocket, and stores them in the DB.
 */
export async function startChatSession(
  prdId: number,
  projectPath: string,
  initialMessage: string,
  deps: AgentServiceDeps
): Promise<void> {
  const { db, hub, bridge } = deps;

  // Prevent duplicate sessions
  if (activeSessions.has(prdId)) {
    throw new Error(`Session already active for PRD ${prdId}`);
  }

  // Store the user's initial message
  createMessage(db, { prdId, role: "user", content: initialMessage });
  hub.broadcast(prdId, {
    type: "user_message",
    prdId,
    data: { role: "user", content: initialMessage },
  });

  const abortController = new AbortController();

  // Create custom AskUserQuestion MCP tool that bridges to WebSocket
  const askUserQuestionTool = tool(
    "AskUserQuestion",
    "Ask the user a clarifying question. Use this to gather requirements for the PRD.",
    {
      question: z.string().describe("The question to ask the user"),
      options: z
        .array(
          z.object({
            label: z.string().describe("Short label for the option"),
            description: z
              .string()
              .describe("Explanation of what this option means"),
          })
        )
        .describe("Available choices for the user"),
    },
    async (args, extra) => {
      // Generate a unique tool use ID
      const toolUseId = crypto.randomUUID();

      // Store the question as an assistant message
      createMessage(db, {
        prdId,
        role: "assistant",
        content: { type: "ask_user_question", ...args },
        toolUseId,
      });

      // Send to frontend and wait for answer
      const answer = await bridge.askUser(
        prdId,
        toolUseId,
        args.question,
        args.options
      );

      // Store the user's answer
      createMessage(db, {
        prdId,
        role: "user",
        content: answer,
        toolUseId,
      });

      return {
        content: [{ type: "text" as const, text: answer }],
      };
    }
  );

  const mcpServer = createSdkMcpServer({
    name: "min-claude-prd",
    tools: [askUserQuestionTool],
  });

  // Start the agent query
  const q = query({
    prompt: initialMessage,
    options: {
      cwd: projectPath,
      systemPrompt: WRITE_PRD_SYSTEM_PROMPT,
      model: "claude-sonnet-4-6",
      allowedTools: [],
      disallowedTools: ["AskUserQuestion", "Bash", "Write", "Edit"],
      mcpServers: { "min-claude-prd": mcpServer },
      permissionMode: "plan",
      abortController,
      maxTurns: 50,
    },
  });

  activeSessions.set(prdId, { query: q, abortController });

  // Process messages in the background
  processMessages(prdId, q, deps).finally(() => {
    activeSessions.delete(prdId);
  });
}

/**
 * Resume a chat session for a PRD with a new user message.
 */
export async function sendMessage(
  prdId: number,
  sessionId: string,
  message: string,
  projectPath: string,
  deps: AgentServiceDeps
): Promise<void> {
  const { db, hub, bridge } = deps;

  // Prevent duplicate sessions
  if (activeSessions.has(prdId)) {
    throw new Error(`Session already active for PRD ${prdId}`);
  }

  // Store the user message
  createMessage(db, { prdId, role: "user", content: message });
  hub.broadcast(prdId, {
    type: "user_message",
    prdId,
    data: { role: "user", content: message },
  });

  const abortController = new AbortController();

  // Recreate the MCP tool for the resumed session
  const askUserQuestionTool = tool(
    "AskUserQuestion",
    "Ask the user a clarifying question. Use this to gather requirements for the PRD.",
    {
      question: z.string().describe("The question to ask the user"),
      options: z
        .array(
          z.object({
            label: z.string().describe("Short label for the option"),
            description: z
              .string()
              .describe("Explanation of what this option means"),
          })
        )
        .describe("Available choices for the user"),
    },
    async (args) => {
      const toolUseId = crypto.randomUUID();
      createMessage(db, {
        prdId,
        role: "assistant",
        content: { type: "ask_user_question", ...args },
        toolUseId,
      });
      const answer = await bridge.askUser(
        prdId,
        toolUseId,
        args.question,
        args.options
      );
      createMessage(db, { prdId, role: "user", content: answer, toolUseId });
      return { content: [{ type: "text" as const, text: answer }] };
    }
  );

  const mcpServer = createSdkMcpServer({
    name: "min-claude-prd",
    tools: [askUserQuestionTool],
  });

  const q = query({
    prompt: message,
    options: {
      cwd: projectPath,
      systemPrompt: WRITE_PRD_SYSTEM_PROMPT,
      model: "claude-sonnet-4-6",
      resume: sessionId,
      allowedTools: [],
      disallowedTools: ["AskUserQuestion", "Bash", "Write", "Edit"],
      mcpServers: { "min-claude-prd": mcpServer },
      permissionMode: "plan",
      abortController,
      maxTurns: 50,
    },
  });

  activeSessions.set(prdId, { query: q, abortController });

  processMessages(prdId, q, deps).finally(() => {
    activeSessions.delete(prdId);
  });
}

/**
 * Process messages from the agent query and forward them via WebSocket.
 */
async function processMessages(
  prdId: number,
  q: Query,
  deps: AgentServiceDeps
): Promise<void> {
  const { db, hub } = deps;
  let sessionId: string | undefined;
  let accumulatedText = "";

  try {
    for await (const msg of q) {
      // Capture session ID from init message
      if (msg.type === "system" && "subtype" in msg && msg.subtype === "init") {
        sessionId = (msg as { session_id: string }).session_id;
        if (sessionId) {
          updatePrdSessionId(db, prdId, sessionId);
        }
        continue;
      }

      // Handle streaming text events
      if (msg.type === "stream_event") {
        const event = (msg as { event: { type: string; delta?: { type: string; text?: string } } }).event;
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          event.delta.text
        ) {
          accumulatedText += event.delta.text;
          const outgoing: WsOutgoingMessage = {
            type: "agent_text",
            prdId,
            data: { text: event.delta.text, accumulated: accumulatedText },
          };
          hub.broadcast(prdId, outgoing);
        }
        continue;
      }

      // Handle complete assistant messages
      if (msg.type === "assistant") {
        const assistantMsg = msg as {
          type: "assistant";
          message: { content: Array<{ type: string; text?: string }> };
        };
        const textBlocks = assistantMsg.message.content.filter(
          (b) => b.type === "text" && b.text
        );
        if (textBlocks.length > 0) {
          const fullText = textBlocks.map((b) => b.text).join("\n");
          createMessage(db, { prdId, role: "assistant", content: fullText });
        }
        // Reset accumulated text for next assistant turn
        accumulatedText = "";
        continue;
      }

      // Handle result messages
      if (msg.type === "result") {
        const result = msg as SDKResultMessage;
        const outgoing: WsOutgoingMessage = {
          type: "agent_result",
          prdId,
          data: {
            subtype: result.subtype,
            result: "result" in result ? result.result : undefined,
            isError: result.is_error,
          },
        };
        hub.broadcast(prdId, outgoing);
        continue;
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    hub.broadcast(prdId, {
      type: "agent_result",
      prdId,
      data: { subtype: "error", result: errorMessage, isError: true },
    });
  }
}

/** Check if a session is currently active for a PRD. */
export function isSessionActive(prdId: number): boolean {
  return activeSessions.has(prdId);
}

/** Abort an active session for a PRD. */
export function abortSession(prdId: number): boolean {
  const session = activeSessions.get(prdId);
  if (!session) return false;
  session.abortController.abort();
  activeSessions.delete(prdId);
  return true;
}

// Export for testing
export { WRITE_PRD_SYSTEM_PROMPT };
