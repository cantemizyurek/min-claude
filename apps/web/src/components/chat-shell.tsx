"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message as SharedMessage } from "@min-claude/shared";
import { MessageSquare } from "lucide-react";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ChatShellProps {
  prdId: number;
  projectId: number;
}

export function ChatShell({ prdId, projectId }: ChatShellProps) {
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/prds/${prdId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {
      // API might not be running
    } finally {
      setLoading(false);
    }
  }, [prdId, projectId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return (
    <div className="flex h-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto max-w-2xl">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Loading messages...
            </p>
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              title="No messages yet"
              description="Start a conversation to see messages here"
              icon={<MessageSquare className="size-8" />}
            />
          ) : (
            messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <PromptInput
            onSubmit={() => {
              // No agent interaction yet — input is a shell placeholder
            }}
          >
            <PromptInputTextarea placeholder="Type a message..." />
            <PromptInputFooter>
              <div />
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
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
