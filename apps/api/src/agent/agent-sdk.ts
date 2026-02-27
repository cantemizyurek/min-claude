/**
 * Agent SDK adapter — re-exports query/tool/createSdkMcpServer from either
 * the real @anthropic-ai/claude-agent-sdk or the mock, depending on MOCK_AGENT env var.
 */
import type {
  SDKMessage,
  SDKResultMessage,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import type * as RealSDK from "@anthropic-ai/claude-agent-sdk";

type SDK = Pick<typeof RealSDK, "query" | "tool" | "createSdkMcpServer">;

let sdkModule: SDK;

if (process.env.MOCK_AGENT === "true") {
  sdkModule = (await import("./mock-agent-sdk")) as unknown as SDK;
} else {
  sdkModule = await import("@anthropic-ai/claude-agent-sdk");
}

export const query: SDK["query"] = sdkModule.query;
export const tool: SDK["tool"] = sdkModule.tool;
export const createSdkMcpServer: SDK["createSdkMcpServer"] =
  sdkModule.createSdkMcpServer;

// Re-export types from the real SDK for use in agent-service.ts
export type { SDKMessage, SDKResultMessage, Query };
