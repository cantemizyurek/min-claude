"use client";

import type { HTMLAttributes } from "react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { ChevronRight, Loader2 } from "lucide-react";

export type ChainOfThoughtProps = HTMLAttributes<HTMLDivElement> & {
  /** The thinking text to display */
  thinking: string;
  /** Whether the agent is still generating thinking content */
  isStreaming?: boolean;
};

export const ChainOfThought = ({
  thinking,
  isStreaming = false,
  className,
  ...props
}: ChainOfThoughtProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn("rounded-lg border border-border", className)}
      {...props}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
        {isStreaming ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            <span>Thinking...</span>
          </>
        ) : (
          <span>Thought process</span>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          <p className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed">
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
};
