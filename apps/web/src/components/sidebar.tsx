"use client";

import { useEffect, useState } from "react";
import type { Project } from "@min-claude/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Plus, Folder, Trash2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function Sidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchProjects() {
    try {
      const res = await fetch(`${API_URL}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // API might not be running yet
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // handle silently
    }
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
    setDialogOpen(false);
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-sidebar-foreground">
          Projects
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setDialogOpen(true)}
          className="text-muted-foreground hover:text-sidebar-foreground"
        >
          <Plus />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {loading ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No projects yet
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{project.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(project.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProjectCreated={handleProjectCreated}
      />
    </aside>
  );
}
