"use client";

import { useState } from "react";
import { DocumentPanel } from "./DocumentPanel";
import { OverviewPanel } from "./OverviewPanel";
import { KeyHints } from "./KeyHints";
import { EditorHeader } from "./EditorHeader";
import { Box } from "@/components/ui";
import { WS_URL } from "@/lib/config";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTandemSync } from "@/hooks/useTandemSync";
import type { Tab } from "@/types/tandem";

export default function TandemEditor() {
  const [tab, setTab] = useState<Tab>("general");
  const { lines, connected, conflictIndex, editLine } = useTandemSync(WS_URL);

  useHotkeys({
    F2: () => setTab((t) => (t === "general" ? "editor" : "general")),
    F4: () => setTab("editor"),
  });

  return (
    <main className="tandem-root flex min-h-screen justify-center p-[clamp(1rem,3vw,2.5rem)] text-sm select-none sm:text-base bg-page">
      <div className="flex w-full max-w-4xl flex-col gap-3">
        <EditorHeader activeTab={tab} onSelectTab={setTab} />

        <Box className="relative flex flex-col min-h-[60vh] max-h-[85vh] h-[80vh] justify-between p-[clamp(1.2rem,3vw,2.2rem)]">
          {tab === "general" ? (
            <OverviewPanel lines={lines} connected={connected} />
          ) : (
            <DocumentPanel lines={lines} conflictIndex={conflictIndex} onEditLine={editLine} />
          )}
          <KeyHints tab={tab} connected={connected} />
        </Box>
      </div>
    </main>
  );
}