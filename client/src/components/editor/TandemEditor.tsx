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
    Tab: () => setTab((t) => (t === "general" ? "editor" : "general")),
    Enter: () => setTab("editor"),
  });

  return (
    <main className="tandem-root flex min-h-screen justify-center px-6 py-16 text-sm select-none sm:px-20 sm:py-24 sm:text-base md:px-40 md:py-32 lg:px-56">
      <div className="flex min-h-[70vh] w-full max-w-4xl flex-col gap-4">
        <EditorHeader activeTab={tab} onSelectTab={setTab} />

        <Box className="relative flex flex-1 flex-col px-4 pt-8 pb-10 sm:px-8">
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