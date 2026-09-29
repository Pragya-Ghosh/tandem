import { memo } from "react";
import type { Line } from "@/types/tandem";

interface LineRowProps {
  line: Line;
  hasConflict: boolean;
  onChange: (index: number, content: string) => void;
}

export const LineRow = memo(function LineRow({ line, hasConflict, onChange }: LineRowProps) {
  return (
    <div className="flex items-center">
      <span className="fg-muted w-10 pr-3 text-right select-none">{line.index}</span>
      <span className="fg-teal w-14 text-xs select-none">[v{line.version}]</span>
      <input
        type="text"
        className="line-input"
        value={line.content}
        data-conflict={hasConflict}
        spellCheck={false}
        aria-label={`Line ${line.index}`}
        onChange={(e) => onChange(line.index, e.target.value)}
      />
    </div>
  );
});