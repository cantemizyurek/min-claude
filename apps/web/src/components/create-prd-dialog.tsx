"use client";

import { useState } from "react";
import type { Prd } from "@min-claude/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CreatePrdDialogProps {
  open: boolean;
  projectId: number;
  onOpenChange: (open: boolean) => void;
  onPrdCreated: (prd: Prd) => void;
}

export function CreatePrdDialog({
  open,
  projectId,
  onOpenChange,
  onPrdCreated,
}: CreatePrdDialogProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/prds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create PRD");
        return;
      }

      const prd = await res.json();
      setTitle("");
      onPrdCreated(prd);
    } catch {
      setError("Could not connect to the API server");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create PRD</DialogTitle>
          <DialogDescription>
            Start a new product requirements document.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="prd-title" className="text-sm text-muted-foreground">
              Title
            </label>
            <Input
              id="prd-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. User authentication flow"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
