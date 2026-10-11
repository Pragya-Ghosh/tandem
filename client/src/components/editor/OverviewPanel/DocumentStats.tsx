"use client";

import { useEffect, useState } from "react";
import { DOCUMENT_NAME } from "@/lib/config";
import type { Line } from "@/types/tandem";
import { ConnectionStatus } from "../ConnectionStatus";
import { Box, Field, Mascot } from "@/components/ui";

interface DocumentStatsProps {
  lines: Line[];
  totalEdits: number;
  connected: boolean;
  fileName?: string | null;
}

export function DocumentStats({
  lines,
  totalEdits,
  connected,
  fileName,
}: DocumentStatsProps) {
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