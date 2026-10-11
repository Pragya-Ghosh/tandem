import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ApiError, createFile, deleteFile, listFiles } from "@/lib/api";

/** A file in the list. Names and ids come from the server. */
export interface LocalFile {
  /** The id used in the URL (?fileId=...) and as the file name on the server. */
  id: string;
  /** What the user called it. */
  name: string;
  /** When it was last saved on the server (ms since epoch). */
  updatedAt: number;
}

const STORAGE_KEY = "tandem_files";
const EMPTY: LocalFile[] = [];

/*
 * THE SERVER IS THE SOURCE OF TRUTH for which files exist and what they are called. The list kept
 * here (and in localStorage) is only a copy, so the screen has something to show before the server
 * answers and when it can't be reached. Every refresh replaces the copy with the server's list, so
 * a file can't show up twice under two names, and a deleted file can't come back.
 *
 * One shared copy serves every component that calls useLocalDatabase(); changes are written to
 * localStorage immediately.
 */
let cache: LocalFile[] | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): LocalFile[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to read local files", e);
    return [];
  }
}

function getFiles(): LocalFile[] {
  if (cache === null) cache = readFromStorage();
  return cache;
}

function setFiles(next: LocalFile[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Failed to save local files", e);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another browser tab changed the list: pick up its version.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const subscribeNever = () => () => {};

let refreshing: Promise<void> | null = null;

/** Replaces the list with the server's. If the server can't be reached, the saved copy stays. */
function refreshFiles(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = listFiles()
    .then((serverFiles) => {
      if (JSON.stringify(serverFiles) !== JSON.stringify(getFiles())) setFiles(serverFiles);
    })
    .catch((err) => console.warn("Could not refresh the file list:", err))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** The list of files for the "choose a file" screens. */
export function useLocalDatabase() {
  // On the server (and while hydrating) the list is empty; the browser's saved copy follows.
  const files = useSyncExternalStore(subscribe, getFiles, () => EMPTY);
  /** False until the browser's copy is available, so the UI doesn't flash "No files". */
  const loaded = useSyncExternalStore(subscribeNever, () => true, () => false);

  // Ask the server for the real list now, and again whenever the user comes back to this window.
  useEffect(() => {
    refreshFiles();
    const onFocus = () => {
      refreshFiles();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /**
   * Creates a file on the server and adds it to the list. If a file with that name already
   * exists you get that one back. Throws (with a readable message) if the server says no.
   */
  const addFile = useCallback(async (name: string): Promise<LocalFile> => {
    const file = await createFile(name);
    setFiles([file, ...getFiles().filter((f) => f.id !== file.id)]);
    return file;
  }, []);

  /** Deletes a file on the server (for everyone) and removes it from the list. */
  const removeFile = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteFile(id);
    } catch (err) {
      // Already gone on the server: just drop it from the list.
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
    setFiles(getFiles().filter((f) => f.id !== id));
  }, []);

  /** Marks a file as just opened (this browser's list only). */
  const touchFile = useCallback((id: string) => {
    setFiles(getFiles().map((f) => (f.id === id ? { ...f, updatedAt: Date.now() } : f)));
  }, []);

  return { files, loaded, addFile, removeFile, touchFile };
}