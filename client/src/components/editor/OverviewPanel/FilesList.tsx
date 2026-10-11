"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Box } from "@/components/ui";
import type { LocalFile } from "@/hooks/useLocalDatabase";

interface FilesListProps {
  files: LocalFile[];
  loaded: boolean;
  /** Create a file with this name and open it. Rejects with a readable message if that fails. */
  onCreate: (name: string) => Promise<void>;
  /** Delete a file on the server. Rejects with a readable message if that fails. */
  onRemove: (id: string) => Promise<void>;
}

export function FilesList({ files, loaded, onCreate, onRemove }: FilesListProps) {
  const [newFileName, setNewFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setNewFileName("");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not create the file.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveClick = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault(); 
    e.stopPropagation();

    // Updated warning to reflect server-side deletion
    if (!window.confirm(`Delete "${name}" for everyone?\nThis permanently deletes it from the server.`)) {
      return;
    }
    
    setError(null);
    const currentFileId = searchParams.get("fileId");

    try {
      // If we are deleting the currently open file, navigate away immediately
      if (currentFileId === id) {
        const remainingFiles = files.filter((f) => f.id !== id);
        const nextUrl = remainingFiles.length > 0 
          ? `/?fileId=${encodeURIComponent(remainingFiles[0].id)}` 
          : "/";
        router.push(nextUrl);
      }
      
      await onRemove(id);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not delete the file.");
    }
  };

  return (
    <Box title="Local Workspace Files" className="w-full">
      <div style={{ padding: "0.75rem 1.25rem" }} className="flex flex-col gap-4">
        <form onSubmit={handleCreateSubmit} className="flex gap-2 w-full max-w-sm">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="Enter New File Name"
            className="flex-1 bg-transparent border border-zinc-700/50 rounded-sm px-2 py-1 text-sm outline-none focus:border-teal-500 transition-colors disabled:opacity-50"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!newFileName.trim() || busy}
            className="border border-zinc-700/50 px-3 py-1 rounded-sm text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {busy ? "..." : "Create"}
          </button>
        </form>

        {error && <p role="alert" className="text-red-400 text-sm animate-fade-in">{error}</p>}

        <div className="max-h-72 overflow-y-auto overscroll-contain pr-2">
          {!loaded ? (
            <p className="fg-dim">Loading…</p>
          ) : files.length === 0 ? (
            <p className="fg-dim">No files found.</p>
          ) : (
            <div className="flex w-full flex-col gap-1.5 mt-2">
              {files.map((file) => (
                <div key={file.id} className="flex w-full justify-between items-center group">
                  <div className="flex items-center gap-3">
                    <span className="fg-teal opacity-70">📄</span>
                    <Link
                      href={`/?fileId=${encodeURIComponent(file.id)}`}
                      className="hover:text-teal-400 transition-colors"
                    >
                      {file.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono fg-dim">
                      {new Date(file.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveClick(e, file.id, file.name)}
                      className="text-red-500 hover:text-red-400 text-xs cursor-pointer transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Box>
  );
}