import type { Line } from "@/types/tandem";
import { KeyboardEvent, ClipboardEvent } from "react";

interface LineRowProps {
  line: Line;
  hasConflict: boolean;
  showVersion: boolean;
  selected: boolean;
  maxDigits: number;
  onChange: (index: number, content: string) => void;
  onAddLine: (afterIndex: number) => void;
  onRemoveLine: (index: number) => void;
  onSelectAll: () => void;
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
  onSelectAll,
  onPasteLines,
}: LineRowProps) {
  const siblingInput = (el: HTMLElement, dir: "previous" | "next") =>
    (dir === "previous"
      ? el.parentElement?.previousElementSibling
      : el.parentElement?.nextElementSibling
    )?.querySelector("input");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelectAll();
    } 
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      siblingInput(target, "previous")?.focus();
    } 
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      siblingInput(target, "next")?.focus();
    } 
    else if (e.key === "Enter") {
      e.preventDefault();
      onAddLine(line.index);
      setTimeout(() => siblingInput(target, "next")?.focus(), 0);
    } 
    else if (e.key === "Backspace" && line.content === "") {
      e.preventDefault();
      const prev = siblingInput(target, "previous");
      onRemoveLine(line.index);
      prev?.focus();
    } 
    else if (e.key === "Tab") {
      e.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const spaces = "  ";
      onChange(line.index, target.value.substring(0, start) + spaces + target.value.substring(end));
      setTimeout(() => target.setSelectionRange(start + spaces.length, start + spaces.length), 0);
    }
  };

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
      <div
        className="w-12 text-[16px] text-dim select-none flex items-center justify-end font-mono"
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