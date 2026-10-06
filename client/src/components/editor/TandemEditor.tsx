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
  const { lines, connected, conflictId, editLine, addLine, removeLine } = useTandemSync(WS_URL);

  useHotkeys({
    F2: () => setTab((t) => (t === "general" ? "editor" : "general")),
    F4: () => setTab("editor"),
  });

  return (
    <main className="tandem-root bg-page flex h-dvh w-full flex-col gap-3 overflow-hidden p-[clamp(1rem,2vw,1.5rem)] text-sm select-none sm:text-base">
      <EditorHeader activeTab={tab} onSelectTab={setTab} />

      {/* The main box takes all the height the header leaves. */}
      <Box className="relative flex min-h-0 flex-1 flex-col p-[clamp(1rem,2.5vw,2rem)]">
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            tab === "general"
              ? "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : ""
          }`}
        >
          {tab === "general" ? (
            <div className="my-auto">
              <OverviewPanel lines={lines} connected={connected} />
            </div>
          ) : (
            <DocumentPanel
              lines={lines}
              connected={connected}
              conflictId={conflictId}
              onEditLine={editLine}
              onAddLine={addLine}
              onRemoveLine={removeLine}
            />
          )}
        </div>

        <KeyHints tab={tab} connected={connected} />
      </Box>
    </main>
  );
}