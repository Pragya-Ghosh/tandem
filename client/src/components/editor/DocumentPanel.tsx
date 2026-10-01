import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";
import { useRef, useState, useEffect } from "react";

interface DocumentPanelProps {
  lines: Line[];
  conflictIndex: number | null;
  onEditLine: (index: number, content: string) => void;
}

const renumber = (lines: Line[]): Line[] => lines.map((l, i) => ({ ...l, index: i + 1 }));

export function DocumentPanel({ lines, conflictIndex, onEditLine }: DocumentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localLines, setLocalLines] = useState<Line[]>([{ index: 1, version: 0, content: "" }]);
  const [showVersions, setShowVersions] = useState(false);
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    if (lines.length > 0) setLocalLines(lines);
  }, [lines]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Alt") setShowVersions(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Alt") setShowVersions(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const handleEditLine = (index: number, content: string) => {
    setLocalLines((prev) => prev.map((l) => (l.index === index ? { ...l, content } : l)));
    onEditLine(index, content);
  };

  const handleAddLine = (afterIndex: number) => {
    setLocalLines((prev) => {
      const next = [...prev];
      const pos = next.findIndex((l) => l.index === afterIndex) + 1;
      next.splice(pos, 0, { index: afterIndex + 1, version: 0, content: "" });
      return renumber(next);
    });
  };

  const handleRemoveLine = (index: number) => {
    setLocalLines((prev) => (prev.length <= 1 ? prev : renumber(prev.filter((l) => l.index !== index))));
  };

  /** Multi-line paste: split into lines, splice them in at the cursor. */
  const handlePasteLines = (index: number, start: number, end: number, text: string) => {
    const pieces = text.replace(/\r\n?/g, "\n").split("\n");
    const target = localLines.find((l) => l.index === index);
    if (!target) return;

    const before = target.content.slice(0, start);
    const after = target.content.slice(end);
    const lastLen = pieces[pieces.length - 1].length;

    pieces[0] = before + pieces[0];
    pieces[pieces.length - 1] += after;

    setLocalLines((prev) => {
      const pos = prev.findIndex((l) => l.index === index);
      const replaced: Line[] = pieces.map((content, i) => ({
        index: 0,
        version: i === 0 ? target.version : 0,
        content,
      }));
      return renumber([...prev.slice(0, pos), ...replaced, ...prev.slice(pos + 1)]);
    });

    onEditLine(index, pieces[0]); // sync the line that already exists on the server

    // put the cursor right after the pasted text
    setTimeout(() => {
      const input = containerRef.current?.querySelectorAll("input")[index - 1 + pieces.length - 1];
      if (input) {
        input.focus();
        input.setSelectionRange(lastLen, lastLen);
      }
    }, 0);
  };

  /* ---------- select-all (Ctrl/Cmd + A) & clear ---------- */

  const joined = () => localLines.map((l) => l.content).join("\n");
  
  const clearAll = () => {
    // Resets document to a single empty line so extra line numbers disappear
    setLocalLines([{ index: 1, version: 0, content: "" }]);
    onEditLine(1, "");
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!allSelected) return;
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ["a", "c", "x"].includes(e.key.toLowerCase())) return;

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation(); // don't let LineRow remove a line
      clearAll();
    }
    setAllSelected(false);
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (!allSelected) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", joined());
  };

  const handleCut = (e: React.ClipboardEvent) => {
    if (!allSelected) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", joined());
    clearAll();
    setAllSelected(false);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      const inputs = containerRef.current.querySelectorAll("input");
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }
  };

  return (
    <Box title="Active Document" className="mt-2 flex h-full min-h-0 flex-1 flex-col p-3">
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        onKeyDownCapture={handleKeyDownCapture}
        onMouseDownCapture={() => setAllSelected(false)}
        onCopy={handleCopy}
        onCut={handleCut}
        className="h-0 flex-1 overflow-y-auto cursor-text px-2 pb-12 overscroll-contain"
      >
        {localLines.map((line) => (
          <LineRow
            key={line.index}
            line={line}
            hasConflict={conflictIndex === line.index}
            showVersion={showVersions}
            selected={allSelected}
            onChange={handleEditLine}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onSelectAll={() => setAllSelected(true)}
            onPasteLines={handlePasteLines}
          />
        ))}
      </div>
    </Box>
  );
}