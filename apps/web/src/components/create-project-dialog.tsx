"use client";

import { useState } from "react";
import type { Project } from "@min-claude/shared";
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

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (project: Project) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create project");
        return;
      }

      const project = await res.json();
      setName("");
      setPath("");
      onProjectCreated(project);
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
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Point to a local directory containing a git repository.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm text-muted-foreground">
              Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My project"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="path" className="text-sm text-muted-foreground">
              Local path
            </label>
            <Input
              id="path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/projects/my-repo"
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
