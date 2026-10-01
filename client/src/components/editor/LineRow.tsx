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
    <div className="flex items-center">
      
      {/* 
        Line Numbers: 
        w-12 gives it enough width, text-[18px] explicitly forces the size 
      */}
      <div className="w-12 shrink-0 pr-3 text-right text-[18px] text-dim select-none border-r border-dim">
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

        className="line-input ml-3 min-w-0 !text-[16px]"
      />
      
      {showVersion && (
        <div className="text-[14px] text-teal-500 select-none pl-2 pr-2">
          v{line.version}
        </div>
      )}
    </div>
  );
}