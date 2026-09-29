"use client";

import { useEffect, useRef, useState } from "react";

interface Line {
  index: number;
  version: number;
  content: string;
}

export default function TandemEditor() {
  const [lines, setLines] = useState<Line[]>([]);
  const [conflictIndex, setConflictIndex] = useState<number | null>(null);
  
  //using a ref for the WebSocket so it persists without causing React re-renders
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    //Connect to the Node.js OCC Engine
    ws.current = new WebSocket("ws://localhost:5000");

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "init") {
        setLines(message.data);
      } 
      else if (message.type === "line_updated") {
        setLines((prev) =>
          prev.map((line) =>
            line.index === message.data.index ? message.data : line
          )
        );
      } 
      else if (message.type === "edit_rejected") {
        const { lineIndex, authoritativeLine, reason } = message.data;
        console.warn(reason);
        
        setLines((prev) =>
          prev.map((line) =>
            line.index === lineIndex ? authoritativeLine : line
          )
        );

        // UI CHANGE: Flash the line orange/yellow instead of red to match the new palette
        setConflictIndex(lineIndex);
        setTimeout(() => setConflictIndex(null), 1000);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const handleLineChange = (index: number, newContent: string) => {
    const lineToEdit = lines.find((l) => l.index === index);
    if (!lineToEdit || !ws.current) return;

    setLines((prev) =>
      prev.map((line) =>
        line.index === index ? { ...line, content: newContent } : line
      )
    );

    ws.current.send(
      JSON.stringify({
        type: "edit_line",
        data: {
          lineIndex: index,
          baseVersion: lineToEdit.version,
          newContent: newContent,
        },
      })
    );
  };

  return (
    <main className="min-h-screen p-4 sm:p-8 flex items-center justify-center select-none tracking-tight text-sm sm:text-base">
      {/* Outer TUI Border Container */}
      <div className="w-full max-w-6xl border border-white p-1 relative flex flex-col min-h-[85vh]">
        
        {/* Top Navigation Bar */}
        <div className="flex justify-between items-center border-b border-white pb-2 mb-4 px-2 pt-1">
          <div className="flex gap-4">
            <span className="text-white font-bold">Editor</span>
            <span className="text-gray-500 border-l border-gray-600 pl-4">Network</span>
            <span className="text-gray-500 border-l border-gray-600 pl-4">OCC_Logs</span>
          </div>
          
          {/* Centered Title Badge */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-3 bg-[#09090b] px-2 text-yellow-400 font-bold">
            | tandem-1.0.0 |
          </div>
          
          <div className="text-white hidden sm:block">/workspace/cse31/main.js</div>
        </div>

        {/* ASCII Header & Terminal Prompt */}
        <div className="flex flex-col items-center justify-center py-6 mb-2">
          <pre className="text-orange-400 font-bold leading-tight text-xs sm:text-sm md:text-base">
{`
  __                 __               
 / /____  ____  ____/ /__  ____ ___   
/ __/ __ \`/ __ \\/ __  / _ \\/ __ \`__ \\ 
/ /_/ /_/ / / / / /_/ /  __/ / / / / /
\\__/\\__,_/_/ /_/\\__,_/\\___/_/ /_/ /_/  
`}
          </pre>
          <p className="mt-4 text-yellow-400 italic">Real-Time Optimistic Concurrency Engine</p>
          <p className="text-xs mt-2 text-blue-400">
            pragya.ghosh@tandem:~$ <span className="text-white">./connect --workspace main.js</span>
          </p>
        </div>

        {/* Inner Editor Box */}
        <div className="flex-grow border border-white p-4 relative mt-2 mx-2 mb-4 flex flex-col">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#09090b] px-3 text-white text-sm border-x border-white">
            Active Document
          </div>

          <div className="flex-grow overflow-y-auto space-y-1 pt-2">
            {lines.map((line) => (
              <div key={line.index} className="flex items-center group">
                
                {/* Line Number */}
                <span className="w-10 text-right text-gray-500 pr-4 border-r border-gray-700 mr-4 select-none">
                  {line.index}
                </span>
                
                {/* Version Tracker Badge */}
                <span className="w-14 text-xs text-blue-400 select-none">
                  [v{line.version}]
                </span>

                {/* The Line Editor Input */}
                <input
                  type="text"
                  value={line.content}
                  onChange={(e) => handleLineChange(line.index, e.target.value)}
                  spellCheck={false}
                  className={`flex-1 bg-transparent border outline-none px-2 py-1 font-mono transition-colors duration-200 ${
                    conflictIndex === line.index
                      ? "border-orange-500 bg-orange-950 text-yellow-400"
                      : "border-transparent hover:bg-gray-900 focus:bg-[#1a1a2e] focus:border-blue-900 text-white"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Keybinding Legend */}
        <div className="border-t border-white pt-2 mx-2 pb-1 text-xs sm:text-sm flex justify-between text-gray-400">
          <span>[Typing &rarr; Auto-Sync]</span>
          <span>[Conflict &rarr; <span className="text-orange-400">Revert</span>]</span>
          <span>[Esc &rarr; Unfocus]</span>
        </div>
      </div>
    </main>
  );
}