"use client";

import { useEffect, useState } from "react";
import { DOCUMENT_NAME } from "@/lib/config";
import type { Line } from "@/types/tandem";
import { ConnectionStatus } from "../ConnectionStatus";
import { Box, Field, Mascot } from "@/components/ui";
import type { ActivityLog } from "@/hooks/useRecentActivity";
import type { LocalFile } from "@/hooks/useLocalDatabase";
import { FilesList } from "./FilesList";

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function DocumentStats({
  lines,
  totalEdits,
  connected,
  fileName,
}: {
  lines: Line[];
  totalEdits: number;
  connected: boolean;
  fileName?: string | null;
}) {
  const [serverUrl, setServerUrl] = useState<string>("...");

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = process.env.NODE_ENV === "production" ? window.location.host : "localhost:5000";
    setServerUrl(`${protocol}//${host}`);
  }, []);

  return (
    <Box title="Document" className="h-full">
      <div style={{ padding: "0.75rem 1.25rem" }} className="flex items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <Field name="File">{fileName || DOCUMENT_NAME}</Field>
          <Field name="Lines">{lines.length}</Field>
          <Field name="Total edits">{totalEdits}</Field>
          <Field name="Server">{serverUrl}</Field>
          <Field name="Status">
            <ConnectionStatus connected={connected} />
          </Field>
        </div>
        <pre className="font-mono text-[9px] leading-[9px] fg-teal select-none shrink-0 hidden sm:block">
          {Mascot}
        </pre>
      </div>
    </Box>
  );
}

function RecentActivityList({ activities }: { activities: ActivityLog[] }) {
  return (
    <Box title="Recent Activity" className="h-full">
      <div style={{ padding: "0.75rem 1.25rem" }}>
        {activities.length === 0 ? (
          <p className="fg-dim">No recent activity…</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex w-full justify-between border-b border-zinc-700/50 pb-1 font-bold text-xs fg-dim mb-2">
              <span>Target Line</span>
              <span>Version & Timestamp</span>
            </div>
            {activities.map((activity) => (
              <div key={activity.id} className="flex w-full justify-between items-center text-sm">
                <span className="font-mono">Line {activity.index}</span>
                <span className="font-mono fg-ok">
                  v{activity.version} ({activity.timeString})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

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
          <DocumentStats lines={lines} totalEdits={totalEdits} connected={connected} fileName={fileName} />
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