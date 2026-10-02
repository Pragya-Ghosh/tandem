import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";
import { useRef, useState, useEffect } from "react";

interface DocumentPanelProps {
  lines: Line[];
  conflictIndex: number | null;
  onEditLine: (index: number, content: string) => void;
  onAddLine?: (afterIndex: number, id?: string) => void; 
  onRemoveLine?: (index: number) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const renumber = (lines: Line[]): Line[] => lines.map((l, i) => ({ ...l, index: i + 1 }));

export function DocumentPanel({ lines, conflictIndex, onEditLine, onAddLine, onRemoveLine }: DocumentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Added stable ID to initial state
  const [localLines, setLocalLines] = useState<Line[]>([{ id: generateId(), index: 1, version: 0, content: "" }]);
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
    const newId = generateId(); // Generate stable ID
    setLocalLines((prev) => {
      const next = [...prev];
      const pos = next.findIndex((l) => l.index === afterIndex) + 1;
      // Inject the stable ID into the new line
      next.splice(pos, 0, { id: newId, index: afterIndex + 1, version: 0, content: "" });
      return renumber(next);
    });
    // Send the exact same ID to the server so they perfectly match
    onAddLine?.(afterIndex, newId);
  };

  const handleRemoveLine = (index: number) => {
    setLocalLines((prev) => (prev.length <= 1 ? prev : renumber(prev.filter((l) => l.index !== index))));
    onRemoveLine?.(index);
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
        id: generateId(), // Add stable ID here as well
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
      setLocalLines([{ id: generateId(), index: 1, version: 0, content: "" }]);
      setAllSelected(false);
      setSelectedIndices(new Set());
      onEditLine(1, "");
      return;
    }

    const remaining = localLines.filter((l) => !selectedIndices.has(l.index));
    const newLines = remaining.length > 0 ? renumber(remaining) : [{ id: generateId(), index: 1, version: 0, content: "" }];

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

    if (e.key === "Escape") {
      const isInputFocused = document.activeElement?.tagName === "INPUT" && containerRef.current?.contains(document.activeElement);
      const hasSelection = allSelected || selectedIndices.size > 0;

      if (hasSelection || isInputFocused) {
        e.preventDefault();
        e.stopPropagation();
        setAllSelected(false);
        setSelectedIndices(new Set());
        
        if (isInputFocused) {
          (document.activeElement as HTMLElement).blur(); // Forces the active line to visually leave focus
        }
        
        containerRef.current?.focus({ preventScroll: true }); // Keeps the keyboard trap active
        return;
      }
    }

    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setAllSelected(true);
      setSelectedIndices(new Set(localLines.map((l) => l.index)));
      return;
    }

    if (!allSelected && selectedIndices.size === 0) return;
    if (["Shift", "Control", "Alt", "Meta", "Escape"].includes(e.key)) return;
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
      // Pull focus directly to the container so onKeyDownCapture fires
      containerRef.current.focus({ preventScroll: true });

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
            if (next.has(lineIndex)) {
              next.delete(lineIndex);
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

    // Clicking anywhere outside the line numbers (text, inputs, or whitespace) clears selection
    setAllSelected(false);
    setSelectedIndices(new Set());
  };

  return (
    <Box title="Active Document" className="mt-2 flex h-full min-h-0 flex-1 flex-col p-3">
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={handleContainerClick}
        onKeyDownCapture={handleKeyDownCapture}
        onCopy={handleCopy}
        onCut={handleCut}
        className="outline-none h-0 flex-1 overflow-y-auto cursor-text px-2 pb-12 overscroll-contain"
      >
        {localLines.map((line) => (
          <LineRow
            key={line.id || line.index} 
            line={line}
            hasConflict={conflictIndex === line.index}
            showVersion={showVersions}
            selected={allSelected || selectedIndices.has(line.index)}
            maxDigits={String(localLines.length).length}
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