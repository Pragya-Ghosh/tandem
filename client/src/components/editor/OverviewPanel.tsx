import { DOCUMENT_NAME, WS_URL } from "@/lib/config";
import type { Line } from "@/types/tandem";
import { ConnectionStatus } from "./ConnectionStatus";
import { Box, Field } from "@/components/ui";

const PREVIEW_ROWS = 8;

interface OverviewPanelProps {
  lines: Line[];
  connected: boolean;
}

export function OverviewPanel({ lines, connected }: OverviewPanelProps) {
  const totalEdits = lines.reduce((sum, l) => sum + l.version, 0);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="pixel text-5xl sm:text-7xl leading-none">
        tandem.
      </h1>

      <p className="mt-2">
        Made for developers who{" "}
        <span className="fg-gold italic">code in tandem.</span>
      </p>
      <div className="border-dim my-2 w-64 border-t sm:w-80" />
      <p className="italic">Powered by Line-Level Optimistic Concurrency Control</p>
      
      <p className="fg-dim" style={{ marginBottom: "70px" }}>
        [with <span className="fg-teal">♥</span> by <a href="https://github.com/Pragya-Ghosh/tandem" style={{color: "inherit"}}><span className="fg-teal">@Pragya-Ghosh</span>]</a>
      </p>

      <Box className="w-full max-w-sm px-2 py-1 text-left">
        <Field name="File">{DOCUMENT_NAME}</Field>
        <Field name="Lines">{lines.length}</Field>
        <Field name="Total edits">{totalEdits}</Field>
        <Field name="Server">{WS_URL}</Field>
        <Field name="Status">
          <ConnectionStatus connected={connected} />
        </Field>
      </Box>

      <Box title="Line versions" className="mt-4 w-full max-w-md px-2 py-2 text-left">
        {lines.length === 0 ? (
          <p className="fg-dim">Waiting for the server…</p>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-x-8">
            <span className="font-bold">Line</span>
            <span className="font-bold">Version</span>
            {lines.slice(0, PREVIEW_ROWS).map((line, i) => (
              <div key={line.index} className="contents">
                <span className={i === 0 ? "fg-ok" : ""}>{line.index}</span>
                <span className={i === 0 ? "fg-ok" : ""}>v{line.version}</span>
              </div>
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}