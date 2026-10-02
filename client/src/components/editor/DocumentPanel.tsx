import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";
import { adjustIndent } from "@/lib/indent";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DocumentPanel — the "Active Document" editor tab.
 *
 * HOW STATE FLOWS
 * ---------------
 * There are two copies of the document:
 *
 *   1. `lines`      (prop)  The authoritative copy from the server, delivered by
 *                           useTandemSync.
 *   2. `localLines` (state) A UI mirror we render from. Structural edits (Enter,
 *                           Backspace, paste, delete, indent) are applied here
 *                           immediately so the editor feels instant, then reported
 *                           to the parent via onEditLine / onAddLine / onRemoveLine.
 *
 * Incoming `lines` would briefly undo an optimistic change, so every structural
 * action takes a "sync lock" (see runOptimistic). While locked, server state is
 * not merged. The lock is released as soon as the server's lines show the change
 * (an "ack"), or after a timeout as a fallback. Once released, local state
 * converges on the server's version.
 *
 * MERGE RULES (when unlocked)
 * ---------------------------
 *   - Server lines win.
 *   - Exception: the line being typed in keeps its local text, so the caret never
 *     jumps because of someone else's update.
 *   - Exception to the exception: if the server rejected an edit to a line
 *     (`conflictIndex`), the server's text wins even if that line is focused.
 *
 * SELECTION MODEL
 * ---------------
 * Whole-line selection is tracked by line id (so it survives remote inserts and
 * deletes): click a gutter number; Shift = range from the anchor, Ctrl/Cmd = toggle;
 * Ctrl/Cmd+A = all. It is cleared by Esc, by clicking inside a line, by typing in a
 * line, and by any structural edit.
 */

/* ============================== Types & helpers ============================== */

interface DocumentPanelProps {
  /** Authoritative lines from the server. */
  lines: Line[];
  /** Index of a line whose edit was just rejected; it is highlighted briefly. */
  conflictIndex: number | null;
  /** Replace the content of an existing line (sent to the server). */
  onEditLine: (index: number, content: string) => void;
  /**
   * Insert an empty line after `afterIndex`. `id` is the client-generated id the
   * server must assign to the new line so both sides agree on its identity.
   */
  onAddLine: (afterIndex: number, id: string) => void;
  /** Remove the line at `index`. */
  onRemoveLine: (index: number) => void;
}

/**
 * What the server's lines must look like before the sync lock can be released.
 * The server processes messages in order, so seeing the newest change implies
 * every earlier one has been applied too.
 */
interface Expectation {
  /** Line ids that must exist (lines we added). */
  present?: string[];
  /** The server must have at most this many lines (lines we removed). */
  maxLength?: number;
}

/** Short random id for lines created on this client (also used as the React key). */
const generateId = () => Math.random().toString(36).substring(2, 9);

/** Stable identity for a line, even if the server did not send an id. */
const idOf = (l: Line): string => l.id ?? `line-${l.index}`;

/** Re-assigns 1-based `index` values so they always match array position. */
const renumber = (lines: Line[]): Line[] => lines.map((l, i) => ({ ...l, index: i + 1 }));

/** True when the server's lines reflect everything described by `exp`. */
const isAcked = (serverLines: Line[], exp: Expectation): boolean =>
  (exp.present ?? []).every((id) => serverLines.some((l) => l.id === id)) &&
  (exp.maxLength === undefined || serverLines.length <= exp.maxLength);

/** Lock length for actions with no way to be acknowledged (e.g. indenting). */
const LOCK_SHORT_MS = 600;
/** Longest we wait for an acknowledgement before trusting the server anyway. */
const LOCK_MAX_MS = 3000;
/** Unconfirmed pasted lines older than this are dropped (server never created them). */
const PENDING_TTL_MS = 10_000;

/* ================================ Component ================================== */

export function DocumentPanel({
  lines,
  conflictIndex,
  onEditLine,
  onAddLine,
  onRemoveLine,
}: DocumentPanelProps) {
  /** The scrollable list; used for DOM queries (inputs) and keyboard focus. */
  const containerRef = useRef<HTMLDivElement>(null);

  /** Rendered copy of the document (see "HOW STATE FLOWS" above). */
  const [localLines, setLocalLines] = useState<Line[]>([
    { id: generateId(), index: 1, version: 0, content: "" },
  ]);

  /** True while Alt is held: shows version badges and borders on every row. */
  const [showVersions, setShowVersions] = useState(false);

  /** Ids of the selected lines (see "SELECTION MODEL"). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** The line a Shift+click range starts from. */
  const anchorIdRef = useRef<string | null>(null);

  /** Id of the line whose input has focus, kept current by focus/blur handlers. */
  const focusedIdRef = useRef<string | null>(null);

  /**
   * Text for lines we created locally (e.g. from a paste) that the server has not
   * confirmed yet, keyed by line id. When the server reports a line with that id
   * we send the text as a normal edit and drop the entry.
   */
  const pendingEditsRef = useRef<Map<string, { content: string; at: number }>>(new Map());

  /** Line indices whose server text must replace local text on the next merge. */
  const forceServerRef = useRef<Set<number>>(new Set());

  /* ------------------------------ Sync lock ------------------------------ */

  const [isOptimisticLocked, setIsOptimisticLocked] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedRef = useRef<Expectation | null>(null);

  /** Ends the lock; the sync effect then re-runs and merges the server's lines. */
  const releaseLock = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = null;
    expectedRef.current = null;
    setIsOptimisticLocked(false);
  }, []);

  /**
   * Runs an optimistic UI change under the sync lock.
   * @param expected what the server's lines must show before the lock can end early.
   *                 Without it the lock is short, because there is nothing to wait for.
   */
  const runOptimistic = (fn: () => void, expected?: Expectation) => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    expectedRef.current = expected ?? null;
    setIsOptimisticLocked(true);
    lockTimer.current = setTimeout(releaseLock, expected ? LOCK_MAX_MS : LOCK_SHORT_MS);
    fn();
  };

  /** Don't leave a timer running if the panel unmounts (e.g. on tab switch). */
  useEffect(
    () => () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
    },
    []
  );

  /* ------------------------------ Server sync ------------------------------ */

  /**
   * Remember which line the server just rejected so the next merge lets the
   * server's text replace the user's text, even if that line is focused.
   * Declared before the sync effect so it runs first in the same commit.
   */
  useEffect(() => {
    if (conflictIndex !== null) forceServerRef.current.add(conflictIndex);
  }, [conflictIndex]);

  /**
   * Merges server state into the local mirror. Runs when the server lines change
   * and when the sync lock changes.
   *
   * 1. Send text for freshly created lines once the server knows about them
   *    (and drop entries the server never created).
   * 2. If locked: release the lock if the server has caught up, then stop. The
   *    merge happens on the re-run that the release triggers.
   * 3. Otherwise replace localLines with the server's lines (see MERGE RULES).
   */
  useEffect(() => {
    if (lines.length === 0) return;

    // 1. Pending pasted lines.
    const now = Date.now();
    pendingEditsRef.current.forEach((pending, id) => {
      const serverLine = lines.find((l) => l.id === id);
      if (serverLine) {
        onEditLine(serverLine.index, pending.content);
        pendingEditsRef.current.delete(id);
      } else if (now - pending.at > PENDING_TTL_MS) {
        pendingEditsRef.current.delete(id);
      }
    });

    // 2. Still waiting for the server?
    if (isOptimisticLocked) {
      const expected = expectedRef.current;
      if (expected && isAcked(lines, expected)) releaseLock();
      return;
    }

    // 3. Merge. Refs are read here, not inside the updater, to keep it pure.
    const focusedId = focusedIdRef.current;
    const forced = new Set(forceServerRef.current);
    forceServerRef.current.clear();

    setLocalLines((prevLocal) =>
      lines.map((incoming) => {
        // Match by id first; fall back to line number for servers without ids.
        const existing =
          (incoming.id && prevLocal.find((l) => l.id === incoming.id)) ||
          prevLocal.find((l) => l.index === incoming.index);
        const keepLocalText =
          !!existing && idOf(existing) === focusedId && !forced.has(incoming.index);

        return {
          ...incoming,
          content: keepLocalText && existing ? existing.content : incoming.content,
          // Keep ids stable so React doesn't remount rows (which drops focus).
          id: incoming.id || existing?.id || generateId(),
        };
      })
    );
  }, [lines, onEditLine, isOptimisticLocked, releaseLock]);

  /* ------------------------------ Alt = versions ----------------------------- */

  /** Holding Alt reveals each line's version badge; releasing hides it. */
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

  /* --------------------------- Selection helpers --------------------------- */

  // Selection is checked against the current lines, so ids of lines that were
  // removed remotely are simply ignored.
  const isSelected = (l: Line) => selectedIds.has(idOf(l));
  const selectedLines = localLines.filter(isSelected);
  const hasSelection = selectedLines.length > 0;
  const everythingSelected = hasSelection && selectedLines.length === localLines.length;

  const clearSelection = () => {
    setSelectedIds(new Set());
    anchorIdRef.current = null;
  };

  const selectAll = () => {
    setSelectedIds(new Set(localLines.map(idOf)));
    anchorIdRef.current = null;
  };

  /**
   * Gutter click on the line with `id`.
   *   plain click      select only this line (click it again to deselect)
   *   Shift + click    select the range from the anchor to this line
   *   Ctrl/Cmd + click toggle this line
   *   Ctrl+Shift       range, added to the existing selection
   */
  const selectLine = (id: string, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;

    if (e.shiftKey) {
      const anchorId = anchorIdRef.current ?? id;
      const a = localLines.findIndex((l) => idOf(l) === anchorId);
      const b = localLines.findIndex((l) => idOf(l) === id);
      if (a !== -1 && b !== -1) {
        const range = localLines.slice(Math.min(a, b), Math.max(a, b) + 1).map(idOf);
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

  /* ------------------------------ Line editing ------------------------------ */

  /** Typing in a line: update the mirror and report to the parent. */
  const handleEditLine = (index: number, content: string) => {
    setLocalLines((prev) => prev.map((l) => (l.index === index ? { ...l, content } : l)));
    onEditLine(index, content);
  };

  /** Enter: insert an empty line after `afterIndex`, tagged with a new id. */
  const handleAddLine = (afterIndex: number) => {
    const newId = generateId();

    runOptimistic(
      () => {
        clearSelection();
        setLocalLines((prev) => {
          const next = [...prev];
          const pos = next.findIndex((l) => l.index === afterIndex) + 1;
          next.splice(pos, 0, { id: newId, index: afterIndex + 1, version: 0, content: "" });
          return renumber(next);
        });
        onAddLine(afterIndex, newId);
      },
      { present: [newId] }
    );
  };

  /** Backspace on an empty line: remove it. The last remaining line is kept. */
  const handleRemoveLine = (index: number) => {
    // Checked up front so we never tell the server to delete the only line
    // while the local copy keeps it.
    if (localLines.length <= 1) return;

    runOptimistic(
      () => {
        clearSelection();
        setLocalLines((prev) => renumber(prev.filter((l) => l.index !== index)));
        onRemoveLine(index);
      },
      { maxLength: localLines.length - 1 }
    );
  };

  /**
   * Multi-line paste at the caret of line `index` (selection = [start, end)).
   *
   * The pasted text is split into pieces. Text before the caret joins the first
   * piece and text after it joins the last, so the original line is split in two.
   * Piece 0 reuses the existing line; every other piece becomes a new line with a
   * fresh id. Only called for pastes containing a newline, so pieces.length >= 2.
   *
   * Server side: edit the first line, add one empty line per extra piece, and park
   * each new line's text in `pendingEditsRef` until the server confirms it exists.
   */
  const handlePasteLines = (index: number, start: number, end: number, text: string) => {
    const target = localLines.find((l) => l.index === index);
    if (!target) return;

    const pieces = text.replace(/\r\n?/g, "\n").split("\n");
    const newIds = pieces.slice(1).map(() => generateId());

    runOptimistic(
      () => {
        const before = target.content.slice(0, start);
        const after = target.content.slice(end);
        // Caret goes right after the pasted text, before the preserved tail.
        const lastLen = pieces[pieces.length - 1].length;

        pieces[0] = before + pieces[0];
        pieces[pieces.length - 1] += after;

        setLocalLines((prev) => {
          const pos = prev.findIndex((l) => l.index === index);
          const replaced: Line[] = pieces.map((content, i) => ({
            id: i === 0 ? target.id : newIds[i - 1],
            index: 0, // fixed by renumber()
            version: i === 0 ? target.version : 0,
            content,
          }));
          return renumber([...prev.slice(0, pos), ...replaced, ...prev.slice(pos + 1)]);
        });

        // Server: update the existing line first
        onEditLine(index, pieces[0]);

        // STAGGERED PACING: Send new lines with a 40ms delay per line
        // to prevent Slow 3G WebSocket buffer choking and eliminate ghost lines.
        let currIndex = index;
        pieces.slice(1).forEach((pieceContent, idx) => {
          const newId = newIds[idx];
          setTimeout(() => {
            onAddLine(currIndex, newId);
            pendingEditsRef.current.set(newId, { content: pieceContent, at: Date.now() });
          }, idx * 40);
          currIndex++;
        });

        // After React renders the new rows, focus the last pasted line.
        setTimeout(() => {
          const input = containerRef.current?.querySelectorAll("input")[index - 1 + pieces.length - 1];
          if (input) {
            input.focus();
            input.setSelectionRange(lastLen, lastLen);
          }
        }, 0);
      },
      { present: newIds }
    );
  };

  /* ------------------- Selection: copy, delete, indent ------------------- */

  /**
   * Deletes the selected lines. If everything is selected the document is reset to
   * a single empty line instead (a document always keeps at least one line).
   * Server removals go from the bottom up so earlier line numbers stay valid.
   */
  const handleDeleteSelected = () => {
    if (!hasSelection) return;

    const firstDeletedIndex = selectedLines[0].index;
    const removeDescending = (toRemove: Line[]) =>
      [...toRemove].sort((a, b) => b.index - a.index).forEach((l) => onRemoveLine(l.index));

    // Case 1: everything selected -> clear to one empty line.
    if (everythingSelected) {
      runOptimistic(
        () => {
          // Reuse line 1's id so the row isn't remounted (that would drop focus).
          setLocalLines([
            { id: localLines[0]?.id ?? generateId(), index: 1, version: 0, content: "" },
          ]);
          clearSelection();

          onEditLine(1, "");
          removeDescending(localLines.filter((l) => l.index !== 1));
        },
        { maxLength: 1 }
      );
      return;
    }

    // Case 2: some lines selected -> remove just those.
    const remaining = localLines.filter((l) => !isSelected(l));

    runOptimistic(
      () => {
        removeDescending(selectedLines);
        setLocalLines(renumber(remaining));
        clearSelection();

        // Put the cursor where the first deleted line used to be.
        setTimeout(() => {
          const inputs = containerRef.current?.querySelectorAll("input");
          if (inputs && inputs.length > 0) {
            inputs[Math.max(0, Math.min(firstDeletedIndex - 1, inputs.length - 1))]?.focus();
          }
        }, 0);
      },
      { maxLength: remaining.length }
    );
  };

  /**
   * Tab / Shift+Tab with lines selected: indent or outdent every selected line.
   * Only lines whose text actually changed are sent to the server.
   */
  const handleTabSelected = (outdent: boolean) => {
    runOptimistic(() => {
      const updated = localLines.map((l) =>
        isSelected(l) ? { ...l, content: adjustIndent(l.content, outdent) } : l
      );

      setLocalLines(updated);

      updated.forEach((l, i) => {
        if (l.content !== localLines[i].content) onEditLine(l.index, l.content);
      });
    });
  };

  /* --------------------------- Keyboard & clipboard --------------------------- */

  /**
   * Capture-phase key handler for the whole list (runs before a row's own handler).
   *
   *  - Esc               clear selection and leave the current line
   *  - Ctrl/Cmd + A      select every line
   *  - (with a selection)
   *      Tab / Shift+Tab  indent / outdent the selected lines
   *      Backspace/Delete delete the selected lines
   *      Ctrl/Cmd + C/X   left to the copy/cut handlers below
   *      typing or Enter  (in a focused line) clears the selection
   *
   * With no selection it does nothing, so rows handle their own typing, arrow
   * navigation, Enter, etc.
   */
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
      // Park focus on the container so later key presses still reach this handler.
      containerRef.current?.focus({ preventScroll: true });
      return;
    }

    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      return;
    }

    // Everything below only applies while lines are selected.
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

    // Typing into a line makes the highlighted selection misleading: drop it.
    if (inInput && (e.key === "Enter" || (e.key.length === 1 && !mod))) {
      clearSelection();
    }
  };

  /** Copy: put the selected lines on the clipboard instead of the DOM selection. */
  const handleCopy = (e: React.ClipboardEvent) => {
    if (!hasSelection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectedLines.map((l) => l.content).join("\n"));
  };

  /** Cut: copy the selected lines, then delete them. */
  const handleCut = (e: React.ClipboardEvent) => {
    if (!hasSelection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectedLines.map((l) => l.content).join("\n"));
    handleDeleteSelected();
  };

  /* ------------------------------ Mouse selection ----------------------------- */

  /**
   * Click handling for the whole list. Clicking a line-number gutter selects the
   * line (see selectLine); any other click (inside a line, or empty space) clears
   * the selection. Gutters are found through the `data-line-gutter` attribute that
   * LineRow renders, and carry the line's id in `data-line-id`.
   */
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const gutter = (e.target as HTMLElement).closest<HTMLElement>("[data-line-gutter]");
    const id = gutter?.dataset.lineId;

    if (gutter && id && containerRef.current?.contains(gutter)) {
      // Focus the container so Delete / Tab / Esc are captured while lines are selected.
      containerRef.current.focus({ preventScroll: true });
      selectLine(id, e);
      return;
    }

    clearSelection();
  };

  /** Track which line's input is focused (read by the sync effect's merge). */
  const handleFocusCapture = (e: React.FocusEvent) => {
    focusedIdRef.current = (e.target as HTMLElement).dataset.lineId ?? null;
  };
  const handleBlurCapture = (e: React.FocusEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") focusedIdRef.current = null;
  };

  /* ---------------------------------- Render ---------------------------------- */

  return (
    <Box title="Active Document" className="mt-2 flex h-full min-h-0 flex-1 flex-col p-3">
      {/* tabIndex=-1 lets the list take focus (for selection shortcuts) without
          becoming a Tab stop. `h-0 flex-1` makes it fill the box and scroll. */}
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={handleContainerClick}
        onKeyDownCapture={handleKeyDownCapture}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        onCopy={handleCopy}
        onCut={handleCut}
        className="outline-none h-0 flex-1 overflow-y-auto cursor-text px-2 pb-12 overscroll-contain"
      >
        {localLines.map((line) => (
          <LineRow
            key={idOf(line)}
            line={line}
            hasConflict={conflictIndex === line.index}
            showVersion={showVersions}
            selected={isSelected(line)}
            maxDigits={String(localLines.length).length}
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