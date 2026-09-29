import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";

interface DocumentPanelProps {
  lines: Line[];
  conflictIndex: number | null;
  onEditLine: (index: number, content: string) => void;
}

export function DocumentPanel({ lines, conflictIndex, onEditLine }: DocumentPanelProps) {
  return (
    <Box title="Active Document" className="mt-2 flex flex-1 flex-col p-3">
      <div className="flex-1 space-y-0.5 overflow-y-auto pt-2">
        {lines.length === 0 && (
          <p className="fg-dim px-2">No lines yet. Is the server running?</p>
        )}
        {lines.map((line) => (
          <LineRow
            key={line.index}
            line={line}
            hasConflict={conflictIndex === line.index}
            onChange={onEditLine}
          />
        ))}
      </div>
    </Box>
  );
}