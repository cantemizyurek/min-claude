"use client";

import type { ComponentProps, HTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SuggestionsProps = HTMLAttributes<HTMLDivElement> & {
  onSuggestionClick?: (suggestion: string) => void;
};

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div
    className={cn("flex flex-wrap items-center gap-2", className)}
    role="group"
    aria-label="Suggested prompts"
    {...props}
  >
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onSuggestionClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onSuggestionClick,
  className,
  children,
  ...props
}: SuggestionProps) => (
  <Button
    variant="outline"
    size="sm"
    className={cn(
      "rounded-full text-xs font-normal text-muted-foreground hover:text-foreground",
      className
    )}
    onClick={() => onSuggestionClick?.(suggestion)}
    {...props}
  >
    {children ?? suggestion}
  </Button>
);
