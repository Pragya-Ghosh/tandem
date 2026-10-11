"use client";

import { useState, useRef, useEffect } from "react";
import type { LocalFile } from "@/hooks/useLocalDatabase";
import { Box } from "@/components/ui";

interface FilePickerProps {
  files: LocalFile[];
  /** False while the list is still being read. */
  loaded: boolean;
  onOpen: (id: string) => void;
  /** Create a file with this name and open it. Rejects with a readable message if that fails. */
  onCreate: (name: string) => Promise<void>;
  /** Delete a file on the server. Rejects with a readable message if that fails. */
  onRemove: (id: string) => Promise<void>;
}

export function FilePicker({ files, loaded, onOpen, onCreate, onRemove }: FilePickerProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on load
  useEffect(() => {
    if (loaded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loaded]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName("");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not create the file.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async (file: LocalFile) => {
    // Updated warning to reflect that this is now a global server deletion
    if (!window.confirm(`Delete "${file.name}" for everyone?\nThis permanently deletes it from the server.`)) {
      return;
    }
    setError(null);
    try {
      await onRemove(file.id);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not delete the file.");
    }
  };

  return (
    <div className="my-auto flex w-full flex-col items-center gap-15 text-center animate-fade-in">
      <div className="flex flex-col items-center gap-2">
        <h1 className="pixel text-5xl leading-none sm:text-7xl tracking-tight">tandem.</h1>
        <p className="fg-dim text-base sm:text-lg mt-4">
          Select a workspace file, or make a new one.
        </p>
      </div>

      <Box title="Workspace Files" className="w-full max-w-3xl text-left shadow-2xl border-zinc-700/60">
        <div style={{ padding: "1.25rem 1.5rem" }} className="flex flex-col gap-6">
          {!loaded ? (
            <div className="py-8 text-center fg-dim text-base animate-pulse">Loading workspace…</div>
          ) : files.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-2">
              <p className="fg-dim text-base mb-3">No workspace files found.</p>
              <span className="text-sm text-zinc-500">Create your first file below to get started.</span>
            </div>
          ) : (
            <ul className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
              {files.map((file) => (
                <li 
                  key={file.id} 
                  className="group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-sm border border-transparent hover:border-zinc-700/50 hover:bg-zinc-800/40 transition-all duration-150"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(file.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                  >
                    <span className="fg-teal text-sm opacity-80 group-hover:translate-x-0.5 transition-transform">▸</span>
                    <span className="truncate font-medium text-base text-zinc-200 group-hover:text-white transition-colors">
                      {file.name}
                    </span>
                    <span className="fg-dim shrink-0 text-xs font-mono ml-auto opacity-60">
                      {new Date(file.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmRemove(file)}
                    aria-label={`Delete ${file.name} for everyone`}
                    className="fg-dim shrink-0 cursor-pointer text-sm hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-0.5 rounded hover:bg-red-500/10"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="flex items-center gap-3 border-t border-zinc-700/50 pt-5">
            <input
              ref={inputRef}
              className="line-input flex-1 h-11 px-4 bg-zinc-900/50 border border-zinc-700/50 rounded-sm outline-none focus:border-teal-500 text-base leading-none transition-colors disabled:opacity-50"
              placeholder="Enter New File Name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="New file name"
              disabled={busy}
            />
            <button 
              type="submit" 
              className="tab shrink-0 h-11 px-6 text-base font-medium flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all" 
              disabled={!name.trim() || busy}
            >
              {busy ? "..." : "Create"}
            </button>
          </form>
          
          {/* Display any API errors (like file already exists, invalid name, etc) */}
          {error && (
            <p role="alert" className="text-red-400 text-sm mt-1 animate-fade-in">
              {error}
            </p>
          )}
        </div>
      </Box>
    </div>
  );
}