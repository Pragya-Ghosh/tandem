"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

interface Line {
  index: number;
  version: number;
  content: string;
}

type Tab = "general" | "editor";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
];

/* ---------- small TUI building blocks ---------- */

// Box with a title sitting on its top border:  ┌──|Title|──┐
function Box({
  title,
  center = true,
  className = "",
  children,
}: {
  title?: string;
  center?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative border border-[#e6e6e6] ${className}`}>
      {title && (
        <span
          className={`absolute -top-[0.7em] bg-[var(--bg)] px-1 leading-none whitespace-nowrap ${
            center ? "left-1/2 -translate-x-1/2" : "left-3"
          }`}
        >
          <span className="text-[#8a8a8a]">|</span>
          <span className="font-bold text-[#e6e6e6]">{title}</span>
          <span className="text-[#8a8a8a]">|</span>
        </span>
      )}
      {children}
    </section>
  );
}

// [Key→ Label] hint, drawn on the bottom border like binsider
function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[#8a8a8a]">[</span>
      <span className="text-[#e5b567]">{k}</span>
      <span className="text-[#8a8a8a]">→ </span>
      <span className="text-[#e6e6e6]">{label}</span>
      <span className="text-[#8a8a8a]">]</span>
    </span>
  );
}

function Field({ name, value }: { name: string; value: ReactNode }) {
  return (
    <div>
      <span className="text-[#5cb8a5]">{name}:</span>{" "}
      <span className="text-[#e6e6e6]">{value}</span>
    </div>
  );
}

/* ---------- main component ---------- */

export default function TandemEditor() {
  const [lines, setLines] = useState<Line[]>([]);
  const [conflictIndex, setConflictIndex] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>("general");

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:5000");

    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => setConnected(false);

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "init") {
        setLines(message.data);
      } else if (message.type === "line_updated") {
        setLines((prev) =>
          prev.map((line) =>
            line.index === message.data.index ? message.data : line
          )
        );
      } else if (message.type === "edit_rejected") {
        const { lineIndex, authoritativeLine, reason } = message.data;
        console.warn(reason);

        setLines((prev) =>
          prev.map((line) =>
            line.index === lineIndex ? authoritativeLine : line
          )
        );

        setConflictIndex(lineIndex);
        setTimeout(() => setConflictIndex(null), 1000);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  // Keyboard: Tab = next tab, Enter = open editor, Esc = leave a line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement)?.tagName === "INPUT";
      if (inInput) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setTab((t) => (t === "general" ? "editor" : "general"));
      } else if (e.key === "Enter") {
        setTab("editor");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const totalEdits = lines.reduce((sum, l) => sum + l.version, 0);

  return (
    <main
      style={
        {
          "--bg": "#161616",
          fontFamily:
            "'JetBrains Mono','Ubuntu Mono','Fira Code',ui-monospace,monospace",
        } as React.CSSProperties
      }
      className="min-h-screen bg-[var(--bg)] text-[#e6e6e6] select-none text-sm sm:text-base px-4 sm:px-10 md:px-20 py-6 flex justify-center"
    >
      {/* Fonts: pixel display face for the logo + a proper terminal mono */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,700;1,400&family=Silkscreen:wght@700&display=swap');
        .pixel { font-family: 'Silkscreen', 'JetBrains Mono', monospace; }
      `}</style>

      <div className="w-full max-w-5xl flex flex-col gap-4 min-h-[calc(100vh-3rem)]">
        {/* ── Top bar: tabs + path, with version badge on the border ── */}
        <Box title="tandem-0.1.0" className="px-3 py-2 flex items-center justify-between gap-4">
          <nav className="flex items-center">
            {TABS.map((t, i) => (
              <span key={t.id} className="flex items-center">
                {i > 0 && <span className="mx-3 text-[#8a8a8a]">|</span>}
                <button
                  onClick={() => setTab(t.id)}
                  className={`cursor-pointer outline-none focus-visible:underline ${
                    tab === t.id
                      ? "font-bold text-[#e6e6e6]"
                      : "text-[#5cb8a5] hover:text-[#8fd6c4]"
                  }`}
                >
                  {t.label}
                </button>
              </span>
            ))}
          </nav>
          <span className="italic hidden sm:block text-[#e6e6e6]">
            /workspace/cse31/main.js
          </span>
        </Box>

        {/* ── Main panel ── */}
        <Box className="flex-1 flex flex-col px-4 sm:px-8 pt-6 pb-8">
          {tab === "general" ? (
            <div className="flex flex-col items-center text-center flex-1 justify-center gap-1">
              <h1 className="pixel text-5xl sm:text-7xl text-[#e6e6e6] leading-none">
                tandem.
              </h1>
              <p className="mt-3">
                Edit files in real time{" "}
                <span className="italic text-[#e5b567]">without stepping on each other.</span>
              </p>
              <div className="w-64 sm:w-80 border-t border-[#8a8a8a] my-2" />
              <p className="italic">Optimistic concurrency, one line at a time</p>
              <p className="text-[#8a8a8a]">
                [with <span className="text-[#5cb8a5]">♥</span> by{" "}
                <span className="text-[#5cb8a5]">@pragya</span>]
              </p>

              <Box className="mt-8 px-2 py-1 text-left w-full max-w-sm">
                <Field name="File" value="main.js" />
                <Field name="Lines" value={lines.length} />
                <Field name="Total edits" value={totalEdits} />
                <Field name="Server" value="ws://localhost:5000" />
                <Field
                  name="Status"
                  value={
                    <span className={connected ? "text-[#8fb573]" : "text-[#e06c4f]"}>
                      {connected ? "connected" : "disconnected"}
                    </span>
                  }
                />
              </Box>

              <Box title="Line versions" className="mt-6 px-2 py-2 w-full max-w-md text-left">
                {lines.length === 0 ? (
                  <p className="text-[#8a8a8a]">Waiting for the server…</p>
                ) : (
                  <div className="grid grid-cols-[auto_1fr] gap-x-8">
                    <span className="font-bold">Line</span>
                    <span className="font-bold">Version</span>
                    {lines.slice(0, 8).map((l) => (
                      <div key={l.index} className="contents">
                        <span className={l.index === lines[0].index ? "text-[#8fb573]" : ""}>
                          {l.index}
                        </span>
                        <span className={l.index === lines[0].index ? "text-[#8fb573]" : ""}>
                          v{l.version}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Box>
            </div>
          ) : (
            <Box title="Active Document" className="flex-1 flex flex-col p-3 mt-2">
              <div className="flex-1 overflow-y-auto space-y-0.5 pt-2">
                {lines.length === 0 && (
                  <p className="text-[#8a8a8a] px-2">
                    No lines yet. Start the server on port 5000.
                  </p>
                )}
                {lines.map((line) => (
                  <div key={line.index} className="flex items-center">
                    <span className="w-10 text-right text-[#6b6b6b] pr-3 select-none">
                      {line.index}
                    </span>
                    <span className="w-14 text-xs text-[#5cb8a5] select-none">
                      [v{line.version}]
                    </span>
                    <input
                      type="text"
                      value={line.content}
                      onChange={(e) => handleLineChange(line.index, e.target.value)}
                      spellCheck={false}
                      className={`flex-1 bg-transparent border outline-none px-2 py-0.5 transition-colors duration-200 select-text ${
                        conflictIndex === line.index
                          ? "border-[#e5b567] bg-[#2a2113] text-[#e5b567]"
                          : "border-transparent hover:bg-[#1f1f1f] focus:bg-[#1f1f1f] focus:border-[#5cb8a5] text-[#e6e6e6]"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </Box>
          )}

          {/* ── Keybinding hints, drawn on the bottom border ── */}
          <div className="absolute -bottom-[0.7em] left-4 right-4 flex flex-wrap gap-x-3 leading-none">
            <span className="bg-[var(--bg)] px-1 flex flex-wrap gap-x-3">
              {tab === "general" && <Key k="Enter" label="Open editor" />}
              <Key k="Tab" label="Next" />
              {tab === "editor" && <Key k="Esc" label="Leave line" />}
              <span className="whitespace-nowrap">
                <span className="text-[#8a8a8a]">[</span>
                <span className={connected ? "text-[#8fb573]" : "text-[#e06c4f]"}>
                  {connected ? "Connected" : "Offline"}
                </span>
                <span className="text-[#8a8a8a]">]</span>
              </span>
            </span>
          </div>
        </Box>
      </div>
    </main>
  );
}