import { useCallback, useSyncExternalStore } from "react";

/** A file this browser knows about. Only the name lives here; the contents live on the server. */
export interface LocalFile {
  /** The id used in the URL (?fileId=...) and as the file name on the server. */
  id: string;
  /** What the user calls it. */
  name: string;
  /** When it was created or last opened here (ms since epoch). */
  updatedAt: number;
}

const STORAGE_KEY = "tandem_files";
const EMPTY: LocalFile[] = [];

/** Letters and digits only: safe for the server's file id rule and for URLs. */
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/*
 * The list lives in ONE place shared by everything that calls useLocalDatabase(), and every change is
 * written to localStorage immediately. That matters because two components use this list, and because
 * the app navigates with a full page load right after creating a file: a write that waited for React
 * to re-render could be lost, and a second copy of the list would overwrite the first.
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

/** The list of files shown on the "choose a file" screen, remembered in localStorage. */
export function useLocalDatabase() {
  // On the server (and while hydrating) the list is empty; the browser's real list follows.
  const files = useSyncExternalStore(subscribe, getFiles, () => EMPTY);
  /** False until the browser's list is available, so the UI doesn't flash "No files". */
  const loaded = useSyncExternalStore(subscribeNever, () => true, () => false);

  /** Adds a file to the list. Pass `id` to remember an existing file (e.g. from a shared link). */
  const addFile = useCallback((name: string, id: string = newId()): LocalFile => {
    const file: LocalFile = { id, name, updatedAt: Date.now() };
    const current = getFiles();
    if (!current.some((f) => f.id === id)) setFiles([file, ...current]);
    return file;
  }, []);

  /** Removes a file from THIS list only. Its contents stay on the server. */
  const removeFile = useCallback((id: string) => {
    setFiles(getFiles().filter((f) => f.id !== id));
  }, []);

  /** Marks a file as just opened. */
  const touchFile = useCallback((id: string) => {
    setFiles(getFiles().map((f) => (f.id === id ? { ...f, updatedAt: Date.now() } : f)));
  }, []);

  return { files, loaded, addFile, removeFile, touchFile };
}