/**
 * Mock Agent SDK that replaces @anthropic-ai/claude-agent-sdk for E2E tests.
 *
 * Activated via MOCK_AGENT=true environment flag.
 * Yields scripted message sequences following the real SDK's async generator pattern:
 *   system init → stream_event text deltas → assistant complete → result
 */

export interface MockScenario {
  messages: MockMessage[];
}

export type MockMessage =
  | { type: "system"; subtype: "init"; session_id: string }
  | {
      type: "stream_event";
      event: {
        type: "content_block_delta";
        delta:
          | { type: "text_delta"; text: string }
          | { type: "thinking_delta"; thinking: string };
      };
    }
  | {
      type: "assistant";
      message: {
        content: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: unknown }
        >;
      };
    }
  | {
      type: "result";
      subtype: "success" | "error";
      result: string;
      is_error: boolean;
    };

const DEFAULT_RESPONSE_TEXT =
  "I'd be happy to help you write a PRD. Let me ask you some questions to understand your project better.";

/** Default scenario: simple text response. */
const defaultScenario: MockScenario = {
  messages: [
    { type: "system", subtype: "init", session_id: "mock-session-001" },
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: DEFAULT_RESPONSE_TEXT },
      },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: DEFAULT_RESPONSE_TEXT }],
      },
    },
    {
      type: "result",
      subtype: "success",
      result: DEFAULT_RESPONSE_TEXT,
      is_error: false,
    },
  ],
};

/** Registry of scenarios by name. Tests can register custom scenarios. */
const scenarios = new Map<string, MockScenario>([
  ["default", defaultScenario],
]);

/** The scenario to use for the next query call. Resets to "default" after use. */
let activeScenarioName = "default";

/** Register a custom scenario for E2E tests. */
export function registerScenario(name: string, scenario: MockScenario): void {
  scenarios.set(name, scenario);
}

/** Set which scenario the next query() call will use. */
export function setActiveScenario(name: string): void {
  activeScenarioName = name;
}

/** Reset the mock state. */
export function resetMock(): void {
  activeScenarioName = "default";
  // Keep only the default scenario
  for (const key of scenarios.keys()) {
    if (key !== "default") scenarios.delete(key);
  }
}

/**
 * Mock query() — yields scripted messages from the active scenario.
 * Returns an async generator with the same interface as the real SDK's Query.
 */
export function query(_opts: unknown): AsyncGenerator<MockMessage, void> & {
  interrupt: () => Promise<void>;
  setPermissionMode: () => Promise<void>;
  setModel: () => Promise<void>;
  setMaxThinkingTokens: () => Promise<void>;
  initializationResult: () => Promise<unknown>;
} {
  const scenario = scenarios.get(activeScenarioName) ?? defaultScenario;

  const gen = (async function* () {
    for (const msg of scenario.messages) {
      // Small delay to simulate realistic streaming
      await new Promise((r) => setTimeout(r, 5));
      yield msg;
    }
  })() as any;

  // Add required Query interface methods
  gen.interrupt = async () => {};
  gen.setPermissionMode = async () => {};
  gen.setModel = async () => {};
  gen.setMaxThinkingTokens = async () => {};
  gen.initializationResult = async () => ({});

  return gen;
}

/**
 * Mock tool() — returns a tool definition object.
 * The handler is preserved so the agent-service can still call it,
 * but the mock query() won't invoke tool calls unless the scenario includes them.
 */
export function tool(
  name: string,
  description: string,
  schema: unknown,
  handler: (...args: unknown[]) => unknown
) {
  return { name, description, schema, handler };
}

/**
 * Mock createSdkMcpServer() — returns the options as a pass-through.
 */
export function createSdkMcpServer(opts: unknown) {
  return opts;
}
