import type { Line } from "@/types/tandem";
import { KeyboardEvent, ClipboardEvent } from "react";
import { INDENT, leadingOutdentSize } from "@/lib/indent";

interface LineRowProps {
  line: Line;
  disabled: boolean; 
  hasConflict: boolean;
  showVersion: boolean;
  selected: boolean;
  maxDigits: number;
  onChange: (id: string, content: string) => void;
  onAddLine: (afterId: string) => void;
  onRemoveLine: (id: string) => void;
  onPasteLines: (id: string, start: number, end: number, text: string) => void;
}

export function LineRow({
  line,
  disabled, 
  hasConflict,
  showVersion,
  selected,
  maxDigits,
  onChange,
  onAddLine,
  onRemoveLine,
  onPasteLines,
}: LineRowProps) {
  const siblingInput = (el: HTMLElement, dir: "previous" | "next") =>
    (dir === "previous"
      ? el.parentElement?.previousElementSibling
      : el.parentElement?.nextElementSibling
    )?.querySelector("input");

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
      onAddLine(line.id); 
      setTimeout(() => siblingInput(target, "next")?.focus(), 0);
    } else if (e.key === "Backspace" && line.content === "") {
      e.preventDefault();
      const prev = siblingInput(target, "previous");
      onRemoveLine(line.id); 
      prev?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;

      if (e.shiftKey) {
        const removed = leadingOutdentSize(target.value);
        if (removed === 0) return;
        onChange(line.id, target.value.slice(removed)); 
        setTimeout(
          () => target.setSelectionRange(Math.max(0, start - removed), Math.max(0, end - removed)),
          0
        );
      } else {
        onChange(line.id, target.value.slice(0, start) + INDENT + target.value.slice(end)); 
        setTimeout(() => target.setSelectionRange(start + INDENT.length, start + INDENT.length), 0);
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    const t = e.currentTarget;
    onPasteLines(
      line.id, 
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
      className={`flex items-center w-full transition-all py-0.5 -my-[1px] px-3 rounded-sm border ${
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
        data-line-gutter
        data-line-id={line.id}
        className="text-[16px] text-dim select-none flex items-center justify-end font-mono"
        style={{
          width: `${digitCount}ch`,
          flexShrink: 0,
          paddingRight: "10px",  
          marginRight: "10px",  
          borderRight: "1px solid",
          borderColor: showVersion ? "rgba(212, 212, 216, 0.2)" : "transparent",
          boxSizing: "content-box", 
        }}
      >
        {line.index}
      </div>

      <input
        type="text"
        value={line.content}
        data-line-id={line.id}
        onChange={(e) => onChange(line.id, e.target.value)} 
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        spellCheck={false}
        autoComplete="off"
        data-conflict={hasConflict}
        disabled={disabled} 
        className={`line-input bg-transparent outline-none min-w-0 flex-1 !text-[16px] ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`} 
        // Added a slight horizontal padding (px-2) to the input itself
        style={{ padding: "0.25rem 0.5rem" }}
      />

      {showVersion && (
        <div
          className="text-[13px] font-mono text-teal-400 px-2 py-0.5 rounded-sm select-none ml-2 shrink-0"
          style={{ backgroundColor: "#1f1f1f", border: "1px solid rgba(212, 212, 216, 0.3)" }}
        >
          v{line.version}
        </div>
      )}
    </div>
  );
}