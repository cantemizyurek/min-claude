"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatShell } from "@/components/chat-shell";

export default function Home() {
  const [selectedPrd, setSelectedPrd] = useState<{
    prdId: number;
    projectId: number;
  }>();

  return (
    <div className="flex h-screen">
      <Sidebar
        selectedPrdId={selectedPrd?.prdId}
        onSelectPrd={(prdId, projectId) =>
          setSelectedPrd({ prdId, projectId })
        }
      />
      <main className="flex flex-1 flex-col">
        {selectedPrd ? (
          <ChatShell
            key={selectedPrd.prdId}
            prdId={selectedPrd.prdId}
            projectId={selectedPrd.projectId}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Select a project to get started
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
