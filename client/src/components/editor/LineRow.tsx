import type { Line } from "@/types/tandem";
import { KeyboardEvent, ClipboardEvent } from "react";
import { INDENT, leadingOutdentSize } from "@/lib/indent";

/**
 * One editable row of the document: a line-number gutter, a text input and (while
 * Alt is held) a version badge.
 *
 * The row only handles keys that concern a single line (arrow navigation, Enter,
 * Backspace on an empty line, Tab / Shift+Tab, multi-line paste). Everything that
 * spans several lines (select all, copy/cut, delete/indent of a selection) lives
 * in DocumentPanel, which sees key events first via a capture handler.
 *
 * DocumentPanel finds rows through two data attributes rendered here:
 *   data-line-gutter  marks the clickable line-number cell
 *   data-line-id      the line's id (on both the gutter and the input)
 */
interface LineRowProps {
  line: Line;
  /** The server rejected the last edit to this line: show the conflict style. */
  hasConflict: boolean;
  /** Show the version badge and row borders (Alt held). */
  showVersion: boolean;
  /** This row is part of the multi-line selection. */
  selected: boolean;
  /** Digits in the highest line number; sizes the gutter so numbers align. */
  maxDigits: number;
  onChange: (index: number, content: string) => void;
  onAddLine: (afterIndex: number) => void;
  onRemoveLine: (index: number) => void;
  /** Multi-line paste at the caret / selection [start, end) of this line. */
  onPasteLines: (index: number, start: number, end: number, text: string) => void;
}

export function LineRow({
  line,
  hasConflict,
  showVersion,
  selected,
  maxDigits,
  onChange,
  onAddLine,
  onRemoveLine,
  onPasteLines,
}: LineRowProps) {
  /** Input of the previous / next row, found through the row's wrapper div. */
  const siblingInput = (el: HTMLElement, dir: "previous" | "next") =>
    (dir === "previous"
      ? el.parentElement?.previousElementSibling
      : el.parentElement?.nextElementSibling
    )?.querySelector("input");

  /**
   * Single-line keyboard behaviour.
   *   Arrow Up/Down   move to the previous / next line
   *   Enter           add a line below and move into it
   *   Backspace       on an empty line, remove it and move up
   *   Tab             insert an indent at the caret
   *   Shift+Tab       remove one indent level from the start of the line
   * (Ctrl/Cmd+A is handled by DocumentPanel.)
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      siblingInput(target, "previous")?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      siblingInput(target, "next")?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onAddLine(line.index);
      setTimeout(() => siblingInput(target, "next")?.focus(), 0);
    } else if (e.key === "Backspace" && line.content === "") {
      e.preventDefault();
      const prev = siblingInput(target, "previous");
      onRemoveLine(line.index);
      prev?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;

      if (e.shiftKey) {
        const removed = leadingOutdentSize(target.value);
        if (removed === 0) return;
        onChange(line.index, target.value.slice(removed));
        // Keep the caret on the same character after the text shifts left.
        setTimeout(
          () => target.setSelectionRange(Math.max(0, start - removed), Math.max(0, end - removed)),
          0
        );
      } else {
        onChange(line.index, target.value.slice(0, start) + INDENT + target.value.slice(end));
        setTimeout(() => target.setSelectionRange(start + INDENT.length, start + INDENT.length), 0);
      }
    }
  };

  /**
   * Pastes containing a line break are handed to DocumentPanel, which splits them
   * into several lines. Single-line pastes use the browser's normal behaviour.
   */
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    const t = e.currentTarget;
    onPasteLines(
      line.index,
      t.selectionStart ?? t.value.length,
      t.selectionEnd ?? t.value.length,
      text
    );
  };

  const background = selected
    ? "rgba(92, 184, 165, 0.25)"
    : showVersion
    ? "rgba(31, 31, 31, 0.5)"
    : "transparent";

  const digitCount = Math.max(1, maxDigits);

  return (
    <div
      className={`flex items-center transition-all py-0 -my-[1px] px-1 rounded-sm border ${
        hasConflict ? "bg-red-900/30 border-red-500" : ""
      }`}
      style={
        hasConflict
          ? undefined
          : {
              borderColor: selected
                ? "rgba(92, 184, 165, 0.6)"
                : showVersion
                ? "rgba(212, 212, 216, 0.2)"
                : "transparent",
              backgroundColor: background,
            }
      }
    >
      {/* Line number. Clicking it selects the line (handled in DocumentPanel). */}
      <div
        data-line-gutter
        data-line-id={line.id}
        className="text-[16px] text-dim select-none flex items-center justify-end font-mono"
        style={{
          width: `${digitCount}ch`,
          minWidth: `${digitCount}ch`,
          flexShrink: 0,
          paddingRight: "8px",
          ...(showVersion
            ? { borderRight: "1px solid rgba(212, 212, 216, 0.2)", marginRight: "0.25rem" }
            : {}),
        }}
      >
        {line.index}
      </div>

      <input
        type="text"
        value={line.content}
        data-line-id={line.id}
        onChange={(e) => onChange(line.index, e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        spellCheck={false}
        autoComplete="off"
        data-conflict={hasConflict}
        className="line-input min-w-0 flex-1 !text-[16px]"
        style={{ padding: "0.15rem" }}
      />

      {showVersion && (
        <div
          className="text-[16px] font-mono text-teal-400 px-2 py-0.5 select-none ml-4 mr-2 shadow-sm shrink-0"
          style={{ backgroundColor: "#1f1f1f", border: "1px solid rgba(212, 212, 216, 0.3)" }}
        >
          v{line.version}
        </div>
      )}
    </div>
  );
}