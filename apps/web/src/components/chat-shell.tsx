"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Message as SharedMessage,
  PrdPhase,
  AskUserQuestionData,
} from "@min-claude/shared";
import { ArrowRight, Loader2, MessageSquare } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { usePrdWebSocket } from "@/lib/use-prd-websocket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ChatShellProps {
  prdId: number;
  projectId: number;
}

export function ChatShell({ prdId, projectId }: ChatShellProps) {
  const [dbMessages, setDbMessages] = useState<SharedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<PrdPhase>("chat");
  const [transitioning, setTransitioning] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  // Track the last DB message ID for WebSocket reconnection replay
  const lastDbMessageId = useMemo(() => {
    if (dbMessages.length === 0) return undefined;
    return dbMessages[dbMessages.length - 1].id;
  }, [dbMessages]);

  // WebSocket connection for real-time messages
  const ws = usePrdWebSocket(prdId, lastDbMessageId);

  // Merge DB messages + real-time messages, deduplicating by ID
  const allMessages = useMemo(() => {
    const seen = new Set<number>();
    const merged: SharedMessage[] = [];
    for (const msg of dbMessages) {
      if (msg.id && !seen.has(msg.id)) {
        seen.add(msg.id);
        merged.push(msg);
      }
    }
    for (const msg of ws.realtimeMessages) {
      if (!msg.id || !seen.has(msg.id)) {
        if (msg.id) seen.add(msg.id);
        merged.push(msg);
      }
    }
    return merged;
  }, [dbMessages, ws.realtimeMessages]);

  // Update local phase when WebSocket reports a phase change
  useEffect(() => {
    if (ws.phase) {
      setPhase(ws.phase);
    }
  }, [ws.phase]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/prds/${prdId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setDbMessages(data);
        // If there are messages, chat has already been started
        if (data.length > 0) {
          setChatStarted(true);
        }
      }
    } catch {
      // API might not be running
    } finally {
      setLoading(false);
    }
  }, [prdId, projectId]);

  const fetchPrd = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/prds`);
      if (res.ok) {
        const prds = await res.json();
        const prd = prds.find((p: { id: number }) => p.id === prdId);
        if (prd) {
          setPhase(prd.phase);
          if (prd.claudeSessionId) {
            setChatStarted(true);
          }
        }
      }
    } catch {
      // API might not be running
    }
  }, [prdId, projectId]);

  useEffect(() => {
    fetchMessages();
    fetchPrd();
  }, [fetchMessages, fetchPrd]);

  async function handlePhaseTransition() {
    setTransitioning(true);
    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/prds/${prdId}/phase`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "issues" }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setPhase(updated.phase);
      }
    } catch {
      // handle silently
    } finally {
      setTransitioning(false);
    }
  }

  async function handleSubmit(message: { text: string }) {
    const text = message.text.trim();
    if (!text) return;

    if (!chatStarted) {
      // First message — start the chat session via HTTP
      setChatStarted(true);
      try {
        await fetch(`${API_URL}/api/prds/${prdId}/start-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
      } catch {
        setChatStarted(false);
      }
    } else {
      // Subsequent messages — send via WebSocket for the handler to resume session
      ws.sendUserMessage(text);
    }
  }

  const hasMessages = allMessages.length > 0 || ws.streamingText !== null;

  return (
    <div className="flex h-full flex-col">
      {/* Header with phase transition */}
      {phase === "chat" && hasMessages && (
        <div className="flex items-center justify-end border-b border-border px-4 py-2">
          <Button
            size="sm"
            onClick={handlePhaseTransition}
            disabled={transitioning}
          >
            {transitioning ? "Transitioning..." : "Finish Chat"}
            {!transitioning && <ArrowRight className="ml-1 size-3.5" />}
          </Button>
        </div>
      )}

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Loading messages...
            </p>
          ) : !hasMessages ? (
            <ConversationEmptyState
              title="No messages yet"
              description="Start a conversation to see messages here"
              icon={<MessageSquare className="size-8" />}
            />
          ) : (
            <>
              {allMessages.map((msg, i) => (
                <ChatMessage key={msg.id ?? `rt-${i}`} message={msg} />
              ))}
              {/* Streaming agent text */}
              {ws.streamingText && (
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse>{ws.streamingText}</MessageResponse>
                  </MessageContent>
                </Message>
              )}
              {/* AskUserQuestion card */}
              {ws.pendingQuestion && (
                <AskUserQuestionCard
                  question={ws.pendingQuestion}
                  onAnswer={ws.sendAnswer}
                />
              )}
              {/* Agent thinking indicator */}
              {ws.isAgentStreaming && !ws.streamingText && (
                <Message from="assistant">
                  <MessageContent>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {phase === "chat" && (
        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto max-w-2xl">
            <PromptInput
              onSubmit={handleSubmit}
            >
              <PromptInputTextarea placeholder="Type a message..." />
              <PromptInputFooter>
                <div />
                <PromptInputSubmit
                  status={ws.isAgentStreaming ? "streaming" : undefined}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      )}

      {phase !== "chat" && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-center text-sm text-muted-foreground">
            Chat phase complete. PRD moved to {phase} phase.
          </p>
        </div>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: SharedMessage }) {
  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.role === "user" ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <MessageResponse>{content}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}

function AskUserQuestionCard({
  question,
  onAnswer,
}: {
  question: AskUserQuestionData;
  onAnswer: (toolUseId: string, answer: string) => void;
}) {
  const [customAnswer, setCustomAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="space-y-3">
          <p className="font-medium">{question.question}</p>
          <div className="flex flex-wrap gap-2">
            {question.options.map((opt) => (
              <Button
                key={opt.label}
                variant="outline"
                size="sm"
                onClick={() => onAnswer(question.toolUseId, opt.label)}
                title={opt.description}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              placeholder="Or type a custom answer..."
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customAnswer.trim()) {
                  onAnswer(question.toolUseId, customAnswer.trim());
                  setCustomAnswer("");
                }
              }}
            />
            <Button
              size="sm"
              disabled={!customAnswer.trim()}
              onClick={() => {
                if (customAnswer.trim()) {
                  onAnswer(question.toolUseId, customAnswer.trim());
                  setCustomAnswer("");
                }
              }}
            >
              Send
            </Button>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}
