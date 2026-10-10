import { useState } from "react";
import { Box } from "@/components/ui";
import type { LocalFile } from "@/hooks/useLocalDatabase";

interface FilesListProps {
  files: LocalFile[];
  loaded: boolean;
  onCreate: (name: string) => void;
  onRemove: (id: string) => void;
}

export function FilesList({ files, loaded, onCreate, onRemove }: FilesListProps) {
  const [newFileName, setNewFileName] = useState("");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;

    onCreate(trimmed);
    setNewFileName("");
  };

  const handleRemoveClick = (id: string, name: string) => {
    if (window.confirm(`Remove "${name}" from this list?\nIts contents stay on the server.`)) {
      onRemove(id);
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
            className="flex-1 bg-transparent border border-zinc-700/50 rounded-sm px-2 py-1 text-sm outline-none focus:border-teal-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!newFileName.trim()}
            className="border border-zinc-700/50 px-3 py-1 rounded-sm text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Create
          </button>
        </form>

        <div className="max-h-[min(20rem,40vh)] overflow-y-auto overscroll-contain pr-2">
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
                    <a href={`/?fileId=${encodeURIComponent(file.id)}`} className="hover:text-teal-400 transition-colors">
                      {file.name}
                    </a>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono fg-dim">
                      {new Date(file.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveClick(file.id, file.name)}
                      className="text-red-500 hover:text-red-400 text-xs cursor-pointer transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    >
                      Remove
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