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

      // Handle Initial Handshake
      if (message.type === "init") {
        setLines(message.data);
      } 
      
      // Handle Successful Peer Edit
      else if (message.type === "line_updated") {
        setLines((prev) =>
          prev.map((line) =>
            line.index === message.data.index ? message.data : line
          )
        );
      } 
      
      // Handle OCC Conflict Rejection
      else if (message.type === "edit_rejected") {
        const { lineIndex, authoritativeLine, reason } = message.data;
        console.warn(reason);
        
        // Forcefully overwrite the stale local state with the server's truth
        setLines((prev) =>
          prev.map((line) =>
            line.index === lineIndex ? authoritativeLine : line
          )
        );

        // Flash the line red in the UI for 1 second
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

    // Optimistic Update: Update the UI instantly so typing feels fast and native
    setLines((prev) =>
      prev.map((line) =>
        line.index === index ? { ...line, content: newContent } : line
      )
    );

    // OCC Payload: Send the edit alongside the baseVersion to the server Bouncer
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
    <main className="min-h-screen bg-gray-950 text-gray-200 p-10 font-mono select-none">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-emerald-500 mb-8">{`> Tandem Collaborative Terminal`}</h1>
        
        <div className="bg-gray-900 border border-gray-800 rounded-lg py-4 shadow-xl">
          {lines.map((line) => (
            <div key={line.index} className="flex items-center group px-4">
              
              {/* Line Number */}
              <span className="w-8 text-right text-gray-500 pr-4 select-none">
                {line.index}
              </span>
              
              {/* Dev Tool: Version Tracker */}
              <span className="w-12 text-xs text-gray-700 select-none">
                v{line.version}
              </span>

              {/* The Line Editor */}
              <input
                type="text"
                value={line.content}
                onChange={(e) => handleLineChange(line.index, e.target.value)}
                spellCheck={false}
                className={`flex-1 bg-transparent border outline-none px-2 py-1 font-mono transition-colors duration-200 ${
                  conflictIndex === line.index
                    ? "border-red-500 bg-red-900/30 text-red-400"
                    : "border-transparent hover:bg-gray-800 focus:bg-gray-800 focus:border-gray-700 text-gray-300"
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}