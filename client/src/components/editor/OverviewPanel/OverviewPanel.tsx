"use client";

import type { Line } from "@/types/tandem";
import type { ActivityLog } from "@/hooks/useRecentActivity";
import type { LocalFile } from "@/hooks/useLocalDatabase";
import { FilesList } from "./FilesList";
import { DocumentStats } from "./DocumentStats";
import { RecentActivityList } from "./RecentActivityList";

interface OverviewPanelProps {
  lines: Line[];
  connected: boolean;
  fileName?: string | null;
  recentActivities: ActivityLog[];
  files: LocalFile[];
  loaded: boolean;
  onCreateFile: (name: string) => void;
  onRemoveFile: (id: string) => void;
}

export function OverviewPanel({ 
  lines, 
  connected, 
  fileName, 
  recentActivities,
  files,
  loaded,
  onCreateFile,
  onRemoveFile
}: OverviewPanelProps) {
  const totalEdits = lines.reduce((sum, l) => sum + l.version, 0);

  return (
    <div className="flex w-full flex-col items-center gap-2.5 pt-0 pb-2 text-center">
      <h1 className="pixel text-5xl sm:text-7xl leading-none">tandem.</h1>

      <div className="flex flex-col items-center w-fit mx-auto">
        <p className="mt-1 text-base sm:text-lg whitespace-nowrap">
          Made for developers who <span className="fg-gold italic">code in tandem.</span>
        </p>
      </div>

      <p className="fg-dim mb-10">
        [with <span className="fg-teal">♥</span> by{" "}
        <a href="https://github.com/Pragya-Ghosh/tandem" style={{ color: "inherit" }}>
          <span className="fg-teal">@Pragya-Ghosh</span>
        </a>
        ]
      </p>

      <div className="flex w-8xl flex-col gap-10 text-left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
          <DocumentStats 
            lines={lines} 
            totalEdits={totalEdits} 
            connected={connected} 
            fileName={fileName} 
          />
          <RecentActivityList activities={recentActivities} />
        </div>

        <FilesList 
          files={files} 
          loaded={loaded} 
          onCreate={onCreateFile} 
          onRemove={onRemoveFile} 
        />
      </div>
    </div>
  );
}