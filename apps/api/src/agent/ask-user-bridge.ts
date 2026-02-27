import type { WsHub } from "../ws/hub";
import type { AskUserQuestionData, WsOutgoingMessage } from "@min-claude/shared";

interface PendingQuestion {
  resolve: (answer: string) => void;
  reject: (error: Error) => void;
}

/**
 * AskUserBridge manages the async handoff between the Agent SDK's
 * AskUserQuestion tool calls and user answers arriving via WebSocket.
 *
 * When the agent asks a question:
 *   1. The bridge stores a pending Promise keyed by `prdId:toolUseId`
 *   2. Sends the question to the frontend via WsHub
 *   3. Returns a Promise that resolves when the user answers
 *
 * When the user answers via WebSocket:
 *   1. `resolveAnswer()` looks up the pending Promise
 *   2. Resolves it with the user's answer
 *   3. The agent tool handler receives the answer and continues
 */
export class AskUserBridge {
  private pending = new Map<string, PendingQuestion>();

  constructor(private hub: WsHub) {}

  private key(prdId: number, toolUseId: string): string {
    return `${prdId}:${toolUseId}`;
  }

  /**
   * Called by the custom AskUserQuestion MCP tool handler.
   * Sends the question to the frontend and returns a Promise
   * that resolves when the user answers.
   */
  askUser(
    prdId: number,
    toolUseId: string,
    question: string,
    options: AskUserQuestionData["options"]
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const k = this.key(prdId, toolUseId);
      this.pending.set(k, { resolve, reject });

      const outgoing: WsOutgoingMessage = {
        type: "agent_tool_use",
        prdId,
        data: { toolUseId, question, options } satisfies AskUserQuestionData,
      };
      this.hub.broadcast(prdId, outgoing);
    });
  }

  /**
   * Called by the WebSocket handler when a user_answer message arrives.
   * Resolves the pending Promise so the agent tool handler can continue.
   */
  resolveAnswer(prdId: number, toolUseId: string, answer: string): boolean {
    const k = this.key(prdId, toolUseId);
    const pending = this.pending.get(k);
    if (!pending) return false;

    this.pending.delete(k);
    pending.resolve(answer);
    return true;
  }

  /**
   * Cancel all pending questions for a PRD (e.g., when session is aborted).
   */
  cancelAll(prdId: number): void {
    for (const [k, pending] of this.pending) {
      if (k.startsWith(`${prdId}:`)) {
        this.pending.delete(k);
        pending.reject(new Error("Session cancelled"));
      }
    }
  }

  /** Check if there's a pending question for a PRD. */
  hasPending(prdId: number): boolean {
    for (const k of this.pending.keys()) {
      if (k.startsWith(`${prdId}:`)) return true;
    }
    return false;
  }

  /** Get the number of pending questions (for testing). */
  get pendingCount(): number {
    return this.pending.size;
  }
}
