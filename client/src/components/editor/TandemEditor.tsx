"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DocumentPanel } from "./DocumentPanel";
import { OverviewPanel } from "./OverviewPanel/OverviewPanel";
import { KeyHints } from "./KeyHints";
import { EditorHeader } from "./EditorHeader";
import { FilePicker } from "./FilePicker";
import { Box } from "@/components/ui";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTandemSync } from "@/hooks/useTandemSync";
import { useLocalDatabase } from "@/hooks/useLocalDatabase";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import type { Tab } from "@/types/tandem";

function TandemEditorContent({ fileId }: { fileId: string | null }) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("general");
  const { files, loaded, addFile, removeFile } = useLocalDatabase();
  const { lines, connected, conflictId, saveStatus, editLine, addLine, removeLine, saveDocument } =
    useTandemSync(fileId);

  // Lives here, not in OverviewPanel: that panel disappears whenever you switch tabs, which would
  // wipe the history each time.
  const recentActivities = useRecentActivity(lines, 7);

  const activeFile = files.find((f) => f.id === fileId);
  const fileName = activeFile?.name || fileId;

  // A shared link can point at a file this browser has never seen: remember it.
  useEffect(() => {
    if (loaded && fileId && !activeFile) addFile(fileId, fileId);
  }, [loaded, fileId, activeFile, addFile]);

  useHotkeys({
    F2: () => setTab((t) => (t === "general" ? "editor" : "general")),
    F4: () => setTab("editor"),
  });

  // Ctrl/Cmd+S saves from either tab. Without this, on the General tab the browser would open its own
  // "Save page as" dialog. (The editor also handles it when a line has focus.)
  useEffect(() => {
    if (!fileId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveDocument();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fileId, saveDocument]);

  // Client-side navigation: the page is not reloaded, and the browser's Back button returns to the previous screen.
  const handleOpen = (id: string) => {
    router.push(`/?fileId=${encodeURIComponent(id)}`);
  };

  const handleCreate = (name: string) => {
    const safeId =
      name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50) +
      "-" +
      Math.random().toString(36).slice(2, 6);

    // Saved to localStorage the moment addFile returns, so the new file is already in the list when we navigate.
    addFile(name, safeId);
    router.push(`/?fileId=${encodeURIComponent(safeId)}`);
  };

  // If no fileId is selected, show the FilePicker screen
  if (!fileId) {
    return (
      <main className="tandem-root bg-page flex h-dvh w-full flex-col items-center justify-center overflow-hidden p-[clamp(1rem,2vw,1.5rem)] text-sm select-none sm:text-base">
        <FilePicker
          files={files}
          loaded={loaded}
          onOpen={handleOpen}
          onCreate={handleCreate}
          onRemove={removeFile}
          onDiscoverServerFile={addFile}
        />
      </main>
    );
  }

  return (
    <main className="tandem-root bg-page flex h-dvh w-full flex-col gap-3 overflow-hidden p-[clamp(1rem,2vw,1.5rem)] text-sm select-none sm:text-base">
      <EditorHeader activeTab={tab} onSelectTab={setTab} fileName={fileName} saveLabel={saveStatus} />

      <Box className="relative flex min-h-0 flex-1 flex-col p-[clamp(1rem,2.5vw,2rem)]">
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            tab === "general" ? "overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden" : ""
          }`}
        >
          {tab === "general" ? (
            <div className="my-auto">
              <OverviewPanel
                lines={lines}
                connected={connected}
                fileName={fileName}
                recentActivities={recentActivities}

                files={files}
                loaded={loaded}
                onCreateFile={handleCreate}
                onRemoveFile={removeFile}
              />
            </div>
          ) : (
            <DocumentPanel
              lines={lines}
              connected={connected}
              conflictId={conflictId}
              onEditLine={editLine}
              onAddLine={addLine}
              onRemoveLine={removeLine}
              onSave={saveDocument}
            />
          )}
        </div>

        <KeyHints tab={tab} connected={connected} />
      </Box>
    </main>
  );
}

/**
 * Reads which file is open from the URL and gives each file its own fresh editor (`key`), so moving
 * to another file resets the tab, the connection and the activity list, just as a page reload did,
 * without reloading the page.
 */
function TandemEditorRoot() {
  const fileId = useSearchParams().get("fileId");
  return <TandemEditorContent key={fileId ?? "none"} fileId={fileId} />;
}

export default function TandemEditor() {
  return (
    <Suspense
      fallback={<div className="bg-page h-dvh w-full flex items-center justify-center fg-dim">Loading Tandem…</div>}
    >
      <TandemEditorRoot />
    </Suspense>
  );
}