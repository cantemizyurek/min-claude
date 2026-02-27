"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";

export default function Home() {
  const [selectedPrdId, setSelectedPrdId] = useState<number>();

  return (
    <div className="flex h-screen">
      <Sidebar
        selectedPrdId={selectedPrdId}
        onSelectPrd={(prdId) => setSelectedPrdId(prdId)}
      />
      <main className="flex flex-1 items-center justify-center">
        {selectedPrdId ? (
          <p className="text-sm text-muted-foreground">
            PRD #{selectedPrdId} selected — chat UI coming soon
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a project to get started
          </p>
        )}
      </main>
    </div>
  );
}
