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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

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

  /* ---------- select, delete, and tab handling ---------- */

  const joinedSelected = () =>
    localLines
      .filter((l) => allSelected || selectedIndices.has(l.index))
      .map((l) => l.content)
      .join("\n");

  const handleDeleteSelected = () => {
    const sortedSelected = Array.from(selectedIndices).sort((a, b) => a - b);
    const firstDeletedIndex = sortedSelected[0] ?? 1;

    if (allSelected || selectedIndices.size >= localLines.length) {
      setLocalLines([{ index: 1, version: 0, content: "" }]);
      setAllSelected(false);
      setSelectedIndices(new Set());
      onEditLine(1, "");
      return;
    }

    const remaining = localLines.filter((l) => !selectedIndices.has(l.index));
    const newLines = remaining.length > 0 ? renumber(remaining) : [{ index: 1, version: 0, content: "" }];

    setLocalLines(newLines);
    setAllSelected(false);
    setSelectedIndices(new Set());

    newLines.forEach((l) => onEditLine(l.index, l.content));

    // Focus the line closest to where the deletion happened 
    setTimeout(() => {
      const inputs = containerRef.current?.querySelectorAll("input");
      if (inputs && inputs.length > 0) {
        const targetInputIndex = Math.min(firstDeletedIndex - 1, inputs.length - 1);
        inputs[Math.max(0, targetInputIndex)]?.focus();
      }
    }, 0);
  };

  const handleTabSelected = (shift: boolean) => {
    setLocalLines((prev) =>
      prev.map((l) => {
        if (!allSelected && !selectedIndices.has(l.index)) return l;
        if (shift) {
          if (l.content.startsWith("  ")) {
            return { ...l, content: l.content.substring(2) };
          } else if (l.content.startsWith(" ")) {
            return { ...l, content: l.content.substring(1) };
          }
          return l;
        } else {
          return { ...l, content: "  " + l.content };
        }
      })
    );
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setAllSelected(true);
      setSelectedIndices(new Set(localLines.map((l) => l.index)));
      return;
    }

    if (!allSelected && selectedIndices.size === 0) return;
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    if (mod && ["c", "x"].includes(e.key.toLowerCase())) return;

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      handleTabSelected(e.shiftKey);
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
      handleDeleteSelected();
    }
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (!allSelected && selectedIndices.size === 0) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", joinedSelected());
  };

  const handleCut = (e: React.ClipboardEvent) => {
    if (!allSelected && selectedIndices.size === 0) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", joinedSelected());
    handleDeleteSelected();
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const lineNumDiv = target.closest(".w-12");
    if (lineNumDiv && containerRef.current?.contains(lineNumDiv)) {
      const lineIndexText = lineNumDiv.textContent?.trim();
      const lineIndex = parseInt(lineIndexText || "", 10);
      if (!isNaN(lineIndex)) {
        e.stopPropagation();
        setAllSelected(false);
        setSelectedIndices((prev) => {
          const next = new Set(prev);
          if (e.shiftKey && next.size > 0) {
            const lastSelected = Array.from(next).pop() || lineIndex;
            const start = Math.min(lastSelected, lineIndex);
            const end = Math.max(lastSelected, lineIndex);
            for (let i = start; i <= end; i++) {
              next.add(i);
            }
          } else if (e.ctrlKey || e.metaKey) {
            if (next.has(lineIndex)) {
              next.delete(lineIndex);
            } else {
              next.add(lineIndex);
            }
          } else {
            if (next.size === 1 && next.has(lineIndex)) {
              next.clear();
            } else {
              next.clear();
              next.add(lineIndex);
            }
          }
          return next;
        });
        return;
      }
    }

    if (e.target === containerRef.current) {
      setAllSelected(false);
      setSelectedIndices(new Set());
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
        onMouseDownCapture={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest(".w-12") && !target.closest("input")) {
            setAllSelected(false);
            setSelectedIndices(new Set());
          }
        }}
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
            selected={allSelected || selectedIndices.has(line.index)}
            onChange={handleEditLine}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onSelectAll={() => {
              setAllSelected(true);
              setSelectedIndices(new Set(localLines.map((l) => l.index)));
            }}
            onPasteLines={handlePasteLines}
          />
        ))}
      </div>
    </Box>
  );
}