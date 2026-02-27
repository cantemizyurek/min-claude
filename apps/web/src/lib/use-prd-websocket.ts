"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WsOutgoingMessage,
  WsIncomingMessage,
  AskUserQuestionData,
  Message as SharedMessage,
  PrdPhase,
} from "@min-claude/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

/** Reconnection config */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export interface StreamingText {
  text: string;
  accumulated: string;
}

export interface ThinkingText {
  thinking: string;
  accumulated: string;
}

export interface UsePrdWebSocketReturn {
  /** Whether the WebSocket is connected */
  connected: boolean;
  /** New messages received via WebSocket (appended to DB-loaded messages) */
  realtimeMessages: SharedMessage[];
  /** Currently streaming agent text (cleared when assistant message completes) */
  streamingText: string | null;
  /** Currently streaming agent thinking text (cleared when assistant message completes) */
  thinkingText: string | null;
  /** Pending AskUserQuestion, if any */
  pendingQuestion: AskUserQuestionData | null;
  /** Current PRD phase (updated by status_change messages) */
  phase: PrdPhase | null;
  /** Whether the agent is currently generating */
  isAgentStreaming: boolean;
  /** Send a user message via WebSocket */
  sendUserMessage: (content: string) => void;
  /** Send an answer to an AskUserQuestion */
  sendAnswer: (toolUseId: string, answer: string) => void;
}

export function usePrdWebSocket(
  prdId: number,
  lastMessageId: number | undefined
): UsePrdWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [realtimeMessages, setRealtimeMessages] = useState<SharedMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] =
    useState<AskUserQuestionData | null>(null);
  const [phase, setPhase] = useState<PrdPhase | null>(null);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);

  // Track lastMessageId in a ref so reconnection uses latest value
  const lastMessageIdRef = useRef(lastMessageId);
  useEffect(() => {
    lastMessageIdRef.current = lastMessageId;
  }, [lastMessageId]);

  const send = useCallback((msg: WsIncomingMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;

      // Subscribe to the PRD channel with replay support
      const subscribeMsg: WsIncomingMessage = {
        type: "subscribe",
        prdId,
        ...(lastMessageIdRef.current != null && {
          lastMessageId: lastMessageIdRef.current,
        }),
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      let msg: WsOutgoingMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Only process messages for our PRD
      if (msg.prdId !== prdId) return;

      switch (msg.type) {
        case "agent_text": {
          const data = msg.data as StreamingText;
          setStreamingText(data.accumulated);
          setIsAgentStreaming(true);
          break;
        }
        case "agent_thinking": {
          const data = msg.data as ThinkingText;
          setThinkingText(data.accumulated);
          setIsAgentStreaming(true);
          break;
        }
        case "agent_tool_use": {
          const data = msg.data as AskUserQuestionData;
          setPendingQuestion(data);
          // Clear streaming since the agent is now waiting for user input
          setStreamingText(null);
          setThinkingText(null);
          setIsAgentStreaming(false);
          break;
        }
        case "agent_result": {
          // Agent turn complete — clear streaming text and thinking
          setStreamingText(null);
          setThinkingText(null);
          setIsAgentStreaming(false);
          break;
        }
        case "user_message": {
          // A message replayed from DB or a new user/assistant message
          const data = msg.data as SharedMessage;
          setRealtimeMessages((prev) => {
            // Deduplicate by ID if present
            if (data.id && prev.some((m) => m.id === data.id)) return prev;
            return [...prev, data];
          });
          // If this is an assistant message, clear streaming and thinking
          if (data.role === "assistant") {
            setStreamingText(null);
            setThinkingText(null);
            setIsAgentStreaming(false);
          }
          break;
        }
        case "status_change": {
          const data = msg.data as { phase: PrdPhase };
          setPhase(data.phase);
          break;
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Reconnect with exponential backoff
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current,
        RECONNECT_MAX_MS
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [prdId]);

  // Connect on mount, clean up on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendUserMessage = useCallback(
    (content: string) => {
      send({ type: "user_message", prdId, content });
    },
    [send, prdId]
  );

  const sendAnswer = useCallback(
    (toolUseId: string, answer: string) => {
      send({ type: "user_answer", prdId, toolUseId, answer });
      setPendingQuestion(null);
    },
    [send, prdId]
  );

  return {
    connected,
    realtimeMessages,
    streamingText,
    thinkingText,
    pendingQuestion,
    phase,
    isAgentStreaming,
    sendUserMessage,
    sendAnswer,
  };
}
