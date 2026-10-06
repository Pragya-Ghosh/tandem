import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";
import { adjustIndent } from "@/lib/indent";
import { useEffect, useRef, useState } from "react";

/**
 * DocumentPanel — the "Active Document" editor tab.
 * 
 * All actions are tracked strictly by line ID so that dynamic line shifts
 * (from inserts, deletes, or remote syncs) never misalign edits or conflicts.
 */

interface DocumentPanelProps {
  lines: Line[];
  /** True if the WebSocket is currently connected. */
  connected: boolean;
  /** Identifier of a line whose edit was rejected. */
  conflictId: string | null;
  /** Replace the text of the line `id`. */
  onEditLine: (id: string, content: string) => void;
  /** Insert an empty line with id `id` after the line `afterId`. */
  onAddLine: (afterId: string, id: string) => void;
  /** Remove the line `id`. */
  onRemoveLine: (id: string) => void;
}

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function DocumentPanel({
  lines,
  connected, // <-- Added connected prop
  conflictId,
  onEditLine,
  onAddLine,
  onRemoveLine,
}: DocumentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorIdRef = useRef<string | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setShowVersions(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setShowVersions(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const isSelected = (l: Line) => selectedIds.has(l.id);
  const selectedLines = lines.filter(isSelected);
  const hasSelection = selectedLines.length > 0;
  const everythingSelected = hasSelection && selectedLines.length === lines.length;

  const clearSelection = () => {
    setSelectedIds(new Set());
    anchorIdRef.current = null;
  };

  const selectAll = () => {
    setSelectedIds(new Set(lines.map((l) => l.id)));
    anchorIdRef.current = null;
  };

  const selectLine = (id: string, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;

    if (e.shiftKey) {
      const anchorId = anchorIdRef.current ?? id;
      const a = lines.findIndex((l) => l.id === anchorId);
      const b = lines.findIndex((l) => l.id === id);
      if (a !== -1 && b !== -1) {
        const range = lines.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id);
        setSelectedIds((prev) => new Set([...(additive ? Array.from(prev) : []), ...range]));
        anchorIdRef.current = anchorId;
        return;
      }
    }

    if (additive) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchorIdRef.current = id;
      return;
    }

    const onlyThis = selectedIds.size === 1 && selectedIds.has(id);
    setSelectedIds(onlyThis ? new Set() : new Set([id]));
    anchorIdRef.current = onlyThis ? null : id;
  };

  const focusInputById = (id: string, caret?: number) => {
    setTimeout(() => {
      const input = containerRef.current?.querySelector(`input[data-line-id="${id}"]`) as HTMLInputElement;
      if (!input) return;
      input.focus();
      if (caret !== undefined) input.setSelectionRange(caret, caret);
    }, 0);
  };

  /* ------------------------------ Line editing by ID ------------------------------ */

  const handleEditLine = (id: string, content: string) => {
    onEditLine(id, content);
  };

  const handleAddLine = (afterId: string) => {
    const after = lines.find((l) => l.id === afterId);
    if (!after) return;
    clearSelection();
    onAddLine(after.id, generateId());
  };

  const handleRemoveLine = (id: string) => {
    const line = lines.find((l) => l.id === id);
    if (!line || lines.length <= 1) return;
    clearSelection();
    onRemoveLine(line.id);
  };

  const handlePasteLines = (id: string, start: number, end: number, text: string) => {
    const target = lines.find((l) => l.id === id);
    if (!target) return;

    const pieces = text.replace(/\r\n?/g, "\n").split("\n");
    const newIds = pieces.slice(1).map(() => generateId());
    const caret = pieces[pieces.length - 1].length;

    pieces[0] = target.content.slice(0, start) + pieces[0];
    pieces[pieces.length - 1] += target.content.slice(end);

    clearSelection();
    onEditLine(target.id, pieces[0]);

    let currAfterId = target.id;
    let finalId = target.id;
    pieces.slice(1).forEach((pieceContent, idx) => {
      const newId = newIds[idx];
      setTimeout(() => {
        onAddLine(currAfterId, newId);
        onEditLine(newId, pieceContent);
      }, idx * 40);
      currAfterId = newId;
      finalId = newId;
    });

    focusInputById(finalId, caret);
  };

  const handleDeleteSelected = () => {
    if (!hasSelection) return;
    const firstId = selectedLines[0].id;

    if (everythingSelected) {
      onEditLine(lines[0].id, "");
      lines.slice(1).forEach((l) => onRemoveLine(l.id));
    } else {
      selectedLines.forEach((l) => onRemoveLine(l.id));
    }

    clearSelection();
    focusInputById(firstId);
  };

  const handleTabSelected = (outdent: boolean) => {
    selectedLines.forEach((l) => {
      const next = adjustIndent(l.content, outdent);
      if (next !== l.content) onEditLine(l.id, next);
    });
  };

  /* --------------------------- Keyboard & clipboard --------------------------- */

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const inInput =
      document.activeElement?.tagName === "INPUT" &&
      !!containerRef.current?.contains(document.activeElement);

    if (e.key === "Escape" && (hasSelection || inInput)) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      if (inInput) (document.activeElement as HTMLElement).blur();
      containerRef.current?.focus({ preventScroll: true });
      return;
    }

    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      return;
    }

    if (!hasSelection) return;
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
      return;
    }

    if (inInput && (e.key === "Enter" || (e.key.length === 1 && !mod))) {
      clearSelection();
    }
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (!hasSelection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectedLines.map((l) => l.content).join("\n"));
  };

  const handleCut = (e: React.ClipboardEvent) => {
    if (!hasSelection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectedLines.map((l) => l.content).join("\n"));
    handleDeleteSelected();
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const gutter = (e.target as HTMLElement).closest<HTMLElement>("[data-line-gutter]");
    const id = gutter?.dataset.lineId;

    if (gutter && id && containerRef.current?.contains(gutter)) {
      containerRef.current.focus({ preventScroll: true });
      selectLine(id, e);
      return;
    }

    clearSelection();
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
        {lines.length === 0 && <p className="fg-dim px-2">Waiting for the server…</p>}

        {lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            disabled={!connected} 
            hasConflict={conflictId === line.id}
            showVersion={showVersions}
            selected={isSelected(line)}
            maxDigits={String(lines.length).length}
            onChange={handleEditLine}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onPasteLines={handlePasteLines}
          />
        ))}
      </div>
    </Box>
  );
}