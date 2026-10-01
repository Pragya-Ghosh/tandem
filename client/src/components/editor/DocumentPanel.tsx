import type { Line } from "@/types/tandem";
import { LineRow } from "./LineRow";
import { Box } from "@/components/ui";
import { useRef, useState, useEffect } from "react";

interface DocumentPanelProps {
  lines: Line[];
  conflictIndex: number | null;
  onEditLine: (index: number, content: string) => void;
}

export function DocumentPanel({ lines, conflictIndex, onEditLine }: DocumentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [localLines, setLocalLines] = useState<Line[]>([{ index: 1, version: 0, content: "" }]);
  
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    if (lines.length > 0) {
      setLocalLines(lines);
    }
  }, [lines]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Alt") setShowVersions(true); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === "Alt") setShowVersions(false); };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => { 
      window.removeEventListener("keydown", handleKeyDown); 
      window.removeEventListener("keyup", handleKeyUp); 
    };
  }, []);

  const handleEditLine = (index: number, content: string) => {
    setLocalLines(prev => prev.map(l => (l.index === index ? { ...l, content } : l)));
    onEditLine(index, content);
  };

  const handleAddLine = (afterIndex: number) => {
    setLocalLines(prev => {
      const newLines = [...prev];
      const insertPos = newLines.findIndex(l => l.index === afterIndex) + 1;
      newLines.splice(insertPos, 0, { index: afterIndex + 1, version: 0, content: "" });
      return newLines.map((l, i) => ({ ...l, index: i + 1 }));
    });
  };

  const handleRemoveLine = (index: number) => {
    setLocalLines(prev => {
      if (prev.length <= 1) return prev; 
      const newLines = prev.filter(l => l.index !== index);
      return newLines.map((l, i) => ({ ...l, index: i + 1 }));
    });
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      const inputs = containerRef.current.querySelectorAll("input");
      if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
      }
    }
  };

  return (
    <Box title="Active Document" className="mt-2 flex flex-1 flex-col p-3">
      <div 
        ref={containerRef}
        onClick={handleContainerClick}
        className="flex-1 overflow-y-auto cursor-text px-2 pb-12" 
      >
        {localLines.map((line) => (
          <LineRow
            key={line.index}
            line={line}
            hasConflict={conflictIndex === line.index}
            showVersion={showVersions} 
            onChange={handleEditLine}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
          />
        ))}
      </div>
    </Box>
  );
}