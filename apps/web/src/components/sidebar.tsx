"use client";

import { useCallback, useEffect, useState } from "react";
import type { Prd, PrdPhase, Project } from "@min-claude/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { CreatePrdDialog } from "@/components/create-prd-dialog";
import {
  Plus,
  Folder,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const phaseConfig: Record<PrdPhase, { label: string; color: string }> = {
  chat: { label: "Chat", color: "bg-blue-500" },
  issues: { label: "Issues", color: "bg-amber-500" },
  execution: { label: "Exec", color: "bg-purple-500" },
  done: { label: "Done", color: "bg-emerald-500" },
};

interface SidebarProps {
  selectedPrdId?: number;
  onSelectPrd?: (prdId: number, projectId: number) => void;
}

export function Sidebar({ selectedPrdId, onSelectPrd }: SidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(
    new Set()
  );
  const [projectPrds, setProjectPrds] = useState<Record<number, Prd[]>>({});
  const [prdDialogProjectId, setPrdDialogProjectId] = useState<number | null>(
    null
  );

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

  const fetchPrds = useCallback(async (projectId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/prds`);
      if (res.ok) {
        const data = await res.json();
        setProjectPrds((prev) => ({ ...prev, [projectId]: data }));
      }
    } catch {
      // handle silently
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, []);

  function toggleProject(projectId: number) {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        if (!projectPrds[projectId]) {
          fetchPrds(projectId);
        }
      }
      return next;
    });
  }

  async function handleDeleteProject(id: number) {
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        setExpandedProjectIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setProjectPrds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } catch {
      // handle silently
    }
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
    setProjectDialogOpen(false);
  }

  function handlePrdCreated(prd: Prd) {
    setProjectPrds((prev) => ({
      ...prev,
      [prd.projectId]: [...(prev[prd.projectId] ?? []), prd],
    }));
    setPrdDialogProjectId(null);
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
          onClick={() => setProjectDialogOpen(true)}
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
            projects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const prds = projectPrds[project.id] ?? [];

              return (
                <div key={project.id}>
                  {/* Project row */}
                  <div className="group flex items-center gap-1 rounded-md px-1 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="flex shrink-0 items-center justify-center size-4 text-muted-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </button>
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span
                      className="flex-1 truncate cursor-pointer ml-1"
                      onClick={() => toggleProject(project.id)}
                    >
                      {project.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrdDialogProjectId(project.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-sidebar-foreground"
                    >
                      <Plus />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {/* Nested PRDs */}
                  {isExpanded && (
                    <div className="ml-3 border-l border-border pl-2">
                      {prds.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No PRDs yet
                        </div>
                      ) : (
                        prds.map((prd) => {
                          const phase = phaseConfig[prd.phase];
                          const isSelected = prd.id === selectedPrdId;

                          return (
                            <button
                              type="button"
                              key={prd.id}
                              onClick={() => onSelectPrd?.(prd.id, project.id)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${
                                isSelected
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent"
                              }`}
                            >
                              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">
                                {prd.title}
                              </span>
                              <span
                                className={`size-2 shrink-0 rounded-full ${phase.color}`}
                                title={phase.label}
                              />
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <CreateProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onProjectCreated={handleProjectCreated}
      />

      {prdDialogProjectId !== null && (
        <CreatePrdDialog
          open
          projectId={prdDialogProjectId}
          onOpenChange={(open) => {
            if (!open) setPrdDialogProjectId(null);
          }}
          onPrdCreated={handlePrdCreated}
        />
      )}
    </aside>
  );
}
