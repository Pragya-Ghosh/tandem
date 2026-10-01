import type { Line } from "@/types/tandem";
import { KeyboardEvent } from "react";

interface LineRowProps {
  line: Line;
  hasConflict: boolean;
  showVersion: boolean; 
  onChange: (index: number, content: string) => void;
  onAddLine: (afterIndex: number) => void;
  onRemoveLine: (index: number) => void;
}

export function LineRow({ line, hasConflict, showVersion, onChange, onAddLine, onRemoveLine }: LineRowProps) {
  
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = target.parentElement?.previousElementSibling?.querySelector("input");
      if (prev) prev.focus();
    } 
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = target.parentElement?.nextElementSibling?.querySelector("input");
      if (next) next.focus();
    }
    else if (e.key === "Enter") {
      e.preventDefault();
      onAddLine(line.index);
      
      setTimeout(() => {
        const next = target.parentElement?.nextElementSibling?.querySelector("input");
        if (next) next.focus();
      }, 0);
    }
    else if (e.key === "Backspace" && line.content === "") {
      e.preventDefault();
      const prev = target.parentElement?.previousElementSibling?.querySelector("input");
      onRemoveLine(line.index);
      if (prev) prev.focus();
    }
  };

  return (
    <div 
      className={`flex items-center transition-all py-0.5 my-0.5 px-1 rounded-sm border ${
        hasConflict ? "bg-red-900/30 border-red-500" : ""
      }`}
      style={
        hasConflict 
          ? undefined 
          : {
              borderColor: showVersion ? "rgba(212, 212, 216, 0.2)" : "transparent",
              backgroundColor: showVersion ? "rgba(31, 31, 31, 0.5)" : "transparent",
            }
      }
    >
      
      <div 
        className="w-12 shrink-0 text-right text-[18px] text-dim select-none"
        style={
          showVersion 
            ? { borderRight: "1px solid rgba(212, 212, 216, 0.2)", paddingRight: "0.75rem", marginRight: "0.25rem" } 
            : { paddingRight: "0.75rem" }
        }
      >
        {line.index}
      </div>

      <input
        type="text"
        value={line.content}
        onChange={(e) => onChange(line.index, e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        data-conflict={hasConflict}
        className="line-input ml-3 min-w-0 !text-[18px]"
      />
      
      {showVersion && (
        <div 
          className="text-[16px] font-mono text-teal-400 px-2 py-0.5 select-none ml-4 mr-2 shadow-sm"
          style={{
            backgroundColor: "#1f1f1f",
            border: "1px solid rgba(212, 212, 216, 0.3)"
          }}
        >
          v{line.version}
        </div>
      )}
    </div>
  );
}