import { DOCUMENT_NAME, WS_URL } from "@/lib/config";
import type { Line } from "@/types/tandem";
import { ConnectionStatus } from "./ConnectionStatus";
import { Box, Field } from "@/components/ui";

interface OverviewPanelProps {
  lines: Line[];
  connected: boolean;
}

export function OverviewPanel({ lines, connected }: OverviewPanelProps) {
  const totalEdits = lines.reduce((sum, l) => sum + l.version, 0);

  return (
    <div className="flex w-full flex-col items-center gap-2.5 -mt-50 pt-0 pb-2 text-center">
      <h1 className="pixel text-5xl sm:text-7xl leading-none">
        tandem.
      </h1>

      {/* Wrapper forces the divider line to match the exact width of the tagline text */}
      <div className="flex flex-col items-center w-fit mx-auto">
        <p className="mt-1 text-base sm:text-lg whitespace-nowrap">
          Made for developers who{" "}
          <span className="fg-gold italic">code in tandem.</span>
        </p>
        <div className="border-dim my-1.5 w-full border-t" />
      </div>

      <p className="italic text-sm sm:text-base">Optimistic Concurrency Control</p>
      <p className="fg-dim mb-20">
        [with <span className="fg-teal">♥</span> by <a href="https://github.com/Pragya-Ghosh/tandem" style={{ color: "inherit" }}><span className="fg-teal">@Pragya-Ghosh</span></a>]
      </p>

      {/* Both boxes stretch to the full width, one below the other. */}
      <div className="flex w-full flex-col gap-6 text-left">
        <Box title="Document">
          <div style={{ padding: "0.75rem 1.25rem" }}>
            <Field name="File">{DOCUMENT_NAME}</Field>
            <Field name="Lines">{lines.length}</Field>
            <Field name="Total edits">{totalEdits}</Field>
            <Field name="Server">{WS_URL}</Field>
            <Field name="Status">
              <ConnectionStatus connected={connected} />
            </Field>
          </div>
        </Box>

        <Box title="Line versions">
          <div style={{ padding: "0.75rem 1.25rem" }}>
            {lines.length === 0 ? (
              <p className="fg-dim">Waiting for the server…</p>
            ) : (
              <div className="max-h-[min(20rem,40vh)] overflow-y-auto overscroll-contain pr-2">
                <div className="bg-page sticky top-0 mb-1 flex w-full justify-between border-b border-zinc-700/50 pb-1 font-bold">
                  <span>Line</span>
                  <span>Version</span>
                </div>
                <div className="flex w-full flex-col gap-1.5">
                  {lines.map((line, i) => (
                    <div key={line.id} className="flex w-full justify-between">
                      <span className={i === 0 ? "fg-ok" : ""}>{line.index}</span>
                      <span className={i === 0 ? "fg-ok" : ""}>v{line.version}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Box>
      </div>
    </div>
  );
}