import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFLICT_FLASH_MS, WS_URL } from "@/lib/config";
import type { ClientMessage, Line, ServerMessage } from "@/types/tandem";

/** What the header shows about saving: a short text and how to colour it. */
export interface SaveStatus {
  text: string;
  tone: "dim" | "warn" | "ok" | "err";
}

/** Whether the shared file is on disk yet. The server is the source of truth for this. */
interface SaveState {
  /** idle = nothing pending, saving = waiting for the server, error = the last save failed. */
  status: "idle" | "saving" | "error";
  /** True when the document has changes that are not on disk yet. */
  dirty: boolean;
  /** When the file was last written to disk (ms since epoch), or null if it never was. */
  savedAt: number | null;
}

interface TandemSocket {
  lines: Line[];
  connected: boolean;
  conflictId: string | null;
  /** The server says this file doesn't exist (deleted, or an old link). It will not reconnect. */
  fileMissing: boolean;
  editLine: (id: string, content: string) => void;
  addLine: (afterId: string, id: string) => void;
  removeLine: (id: string) => void;
  /** Save the file to disk. Waits until this client's pending edits have reached the server. */
  saveDocument: () => void;
  saveStatus: SaveStatus;
}

interface Outbox {
  server: Line[];
  inFlight: Map<string, { baseVersion: number; content: string; at: number }>;
  queued: Map<string, { baseVersion: number; content: string; at: number }>;
  adds: Map<string, { afterId: string; at: number }>;
  removes: Map<string, number>;
}

const EDIT_TIMEOUT_MS = 60_000;
const STRUCTURAL_TIMEOUT_MS = 120_000;
/** How long to wait for the server to confirm a save before showing an error. */
const SAVE_TIMEOUT_MS = 15_000;

const INITIAL_SAVE_STATE: SaveState = { status: "idle", dirty: false, savedAt: null };

const emptyOutbox = (): Outbox => ({
  server: [],
  inFlight: new Map(),
  queued: new Map(),
  adds: new Map(),
  removes: new Map(),
});

/** Helper to guarantee every line object always has a valid timestamp */
const sanitizeLine = (l: Partial<Line>, fallbackTime = Date.now()): Line => {
  const parsedTs = Number(l.timestamp);
  const validTimestamp = (!parsedTs || isNaN(parsedTs) || parsedTs <= 0) ? fallbackTime : parsedTs;

  return {
    id: l.id ?? Math.random().toString(36).substring(2, 9),
    index: Number(l.index) || 0,
    version: Number(l.version) || 1,
    content: l.content ?? "",
    timestamp: validTimestamp,
  };
};

function rebase(box: Outbox): Line[] {
  const serverIds = new Set(box.server.map((l) => l.id));

  const newLine = (id: string, at?: number): Line => ({
    id, index: 0, version: 1, content: "", timestamp: Number(at) || Date.now()
  });

  const addedAfter = new Map<string, string[]>();
  box.adds.forEach(({ afterId }, id) => {
    if (serverIds.has(id)) return;
    const group = addedAfter.get(afterId);
    if (group) group.push(id);
    else addedAfter.set(afterId, [id]);
  });

  let out: Line[] = [];
  const placed = new Set<string>();

  const placeAddsAfter = (afterId: string) => {
    const queue = [...(addedAfter.get(afterId) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (placed.has(id)) continue;

      out.push(newLine(id, box.adds.get(id)?.at));
      placed.add(id);
      queue.push(...(addedAfter.get(id) ?? []));
    }
  };

  // Sanitize all server lines on entry to rebase
  box.server.forEach((l) => {
    out.push(sanitizeLine(l));
    placeAddsAfter(l.id);
  });

  box.adds.forEach((_, id) => {
    if (serverIds.has(id) || placed.has(id)) return;
    out.push(newLine(id, box.adds.get(id)?.at));
    placed.add(id);
    placeAddsAfter(id);
  });

  if (box.removes.size > 0) out = out.filter((l) => !box.removes.has(l.id));

  out = out.map((l) => {
    const pending = box.queued.get(l.id) ?? box.inFlight.get(l.id);
    return pending === undefined
      ? sanitizeLine(l)
      : {
          ...sanitizeLine(l),
          content: pending.content,
          version: l.version + 1,
          timestamp: Number(pending.at) || Date.now()
        };
  });

  return out.map((l, i) => ({ ...l, index: i + 1 }));
}

/**
 * Connects to the server for ONE file and keeps `lines` in step with it.
 * Pass `null` while no file is selected: nothing connects and `lines` stays empty.
 * Pass a different file id to switch files: the previous file's state is discarded.
 * The server address comes from WS_URL (NEXT_PUBLIC_WS_URL), the same one the UI displays.
 */
export function useTandemSync(fileId: string | null): TandemSocket {
  const url = fileId ? `${WS_URL}?fileId=${encodeURIComponent(fileId)}` : null;
  const [lines, setLines] = useState<Line[]>([]);
  const [connected, setConnected] = useState(false);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(INITIAL_SAVE_STATE);

  const socketRef = useRef<WebSocket | null>(null);
  const linesRef = useRef<Line[]>([]);
  const boxRef = useRef<Outbox>(emptyOutbox());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** True from Save being pressed until the save message has actually been sent. */
  const saveRequestedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = useCallback(
    () => socketRef.current?.readyState === WebSocket.OPEN,
    []
  );

  const send = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const recompute = useCallback(() => {
    const next = rebase(boxRef.current);
    linesRef.current = next;
    setLines(next);
  }, []);

  const flash = useCallback((id: string) => {
    setConflictId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setConflictId(null), CONFLICT_FLASH_MS);
  }, []);

  const clearTypingTimers = useCallback(() => {
    typingTimersRef.current.forEach(clearTimeout);
    typingTimersRef.current.clear();
  }, []);

  const clearSaveRequest = useCallback(() => {
    saveRequestedRef.current = false;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  /** Forget everything about the current file (used when switching files). */
  const resetDocument = useCallback(() => {
    boxRef.current = emptyOutbox();
    linesRef.current = [];
    setLines([]);
    setConflictId(null);
    setFileMissing(false);
    clearTypingTimers();
    clearSaveRequest();
    setSaveState(INITIAL_SAVE_STATE);
  }, [clearTypingTimers, clearSaveRequest]);

  const flushEdit = useCallback(
    (id: string) => {
      const box = boxRef.current;
      if (box.inFlight.has(id)) return;

      const queuedEdit = box.queued.get(id);
      if (!queuedEdit) return;

      const serverLine = box.server.find((l) => l.id === id);

      if (!serverLine && !box.adds.has(id)) {
        box.queued.delete(id);
        return;
      }

      if (serverLine && serverLine.content === queuedEdit.content) {
        box.queued.delete(id);
        return;
      }

      if (!send({ type: "edit_line", data: { lineId: id, baseVersion: queuedEdit.baseVersion, newContent: queuedEdit.content } })) {
        return;
      }

      box.queued.delete(id);
      box.inFlight.set(id, {
        baseVersion: queuedEdit.baseVersion,
        content: queuedEdit.content,
        at: queuedEdit.at ?? Date.now()
      });
    },
    [send]
  );

  /**
   * If Save was requested and nothing of ours is still on its way to the server,
   * send the save now. Saving earlier would write the file without our last edits.
   */
  const sendSaveIfIdle = useCallback(() => {
    if (!saveRequestedRef.current) return;
    const box = boxRef.current;
    const idle =
      box.inFlight.size === 0 &&
      box.queued.size === 0 &&
      box.adds.size === 0 &&
      box.removes.size === 0;
    if (!idle) return;
    if (send({ type: "save" })) saveRequestedRef.current = false;
  }, [send]);

  const reconcile = useCallback(() => {
    const box = boxRef.current;
    const now = Date.now();
    const byId = new Map<string, Line>(box.server.map((l): [string, Line] => [l.id, l]));

    box.adds.forEach((add, id) => {
      if (byId.has(id) || now - add.at > STRUCTURAL_TIMEOUT_MS) box.adds.delete(id);
    });

    box.removes.forEach((at, id) => {
      const gone = !byId.has(id) && !box.adds.has(id);
      if (gone || now - at > STRUCTURAL_TIMEOUT_MS) box.removes.delete(id);
    });

    box.inFlight.forEach((f, id) => {
      const line = byId.get(id);
      const lineGone = !line && !box.adds.has(id);

      const ackedOrOverwritten = !!line && line.version > f.baseVersion;

      if (ackedOrOverwritten) {
        const q = box.queued.get(id);
        if (q) {
          q.baseVersion = line.version;
        }
      }

      if (lineGone || ackedOrOverwritten || now - f.at > EDIT_TIMEOUT_MS) {
        box.inFlight.delete(id);
      }
    });

    box.queued.forEach((_, id) => {
      if (!byId.has(id) && !box.adds.has(id)) box.queued.delete(id);
    });

    Array.from(box.queued.keys()).forEach((id) => flushEdit(id));
    sendSaveIfIdle();
    recompute();
  }, [flushEdit, sendSaveIfIdle, recompute]);

  /** Any change to the shared document means the file on disk is out of date. */
  const markDirty = useCallback(() => {
    setSaveState((s) => (s.dirty ? s : { ...s, dirty: true }));
  }, []);

  useEffect(() => {
    // Always start from a clean slate: this runs on first mount AND whenever the file changes.
    resetDocument();
    socketRef.current = null;
    setConnected(false);

    // No file selected: stay disconnected.
    if (!url) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current === socket) setConnected(true);
      };

      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        setConnected(false);

        // Anything the server never confirmed can't be trusted after a drop. Forget it and
        // let the fresh copy the server sends on reconnect decide what the document is.
        const box = boxRef.current;
        box.inFlight.clear();
        box.queued.clear();
        box.adds.clear();
        box.removes.clear();
        clearTypingTimers();
        clearSaveRequest();
        setSaveState((s) => (s.status === "saving" ? { ...s, status: "idle" } : s));
        recompute();

        // 4404 = no such file (deleted, or a stale link); 1008 = not a valid file id.
        // Retrying can't help, so stop instead of reconnecting forever.
        if (event.code === 4404 || event.code === 1008) {
          setFileMissing(true);
          return;
        }

        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return;

        let message: ServerMessage;
        try {
          const raw = JSON.parse(event.data);
          if (raw && typeof raw.type === "string") {
            raw.type = raw.type.toLowerCase();
          }
          message = raw as ServerMessage;
        } catch {
          return;
        }

        const box = boxRef.current;

        switch (message.type) {
          case "init":
          case "line_added":
          case "line_removed":
            // Sanitize incoming server arrays instantly
            box.server = Array.isArray(message.data)
              ? message.data.map((l) => sanitizeLine(l))
              : [];

            if (message.type === "init") {
              // The server tells us whether this file has unsaved changes (top-level fields,
              // or grouped under `status`).
              const info =
                (message as { status?: { dirty?: boolean; savedAt?: number | null } }).status ?? message;
              setSaveState((s) => ({
                status: s.status,
                dirty: !!info.dirty,
                savedAt: info.savedAt ?? null,
              }));
            } else {
              markDirty();
            }
            reconcile();
            break;

          case "line_updated": {
            // Sanitize single updated line instantly
            const updated = sanitizeLine(message.data);
            box.server = box.server.map((l) =>
              l.id === updated.id && updated.version >= l.version ? updated : l
            );
            markDirty();
            reconcile();
            break;
          }

          case "edit_rejected": {
            const { authoritativeLine, reason } = message.data;
            console.warn(reason);

            if (authoritativeLine) {
              const sanitizedAuth = sanitizeLine(authoritativeLine);
              const id = sanitizedAuth.id;
              box.server = box.server.map((l) =>
                l.id === id && sanitizedAuth.version >= l.version ? sanitizedAuth : l
              );

              box.inFlight.delete(id);
              box.queued.delete(id);

              if (typingTimersRef.current.has(id)) {
                clearTimeout(typingTimersRef.current.get(id)!);
                typingTimersRef.current.delete(id);
              }

              reconcile();
              flash(id);
            } else {
              reconcile();
            }
            break;
          }

          case "save_ack": {
            clearSaveRequest();
            const stillPending =
              box.inFlight.size + box.queued.size + box.adds.size + box.removes.size > 0;
            
            // Safe fallback for savedAt
            const ackSavedAt = ('data' in message && message.data?.savedAt) 
              ? message.data.savedAt 
              : Date.now();

            setSaveState({ status: "idle", dirty: stillPending, savedAt: ackSavedAt });
            break;
          }

          case "save_error": {
            const errorReason = ('data' in message && message.data?.reason) 
              ? message.data.reason 
              : "Save failed on server";
            
            console.warn(errorReason);
            clearSaveRequest();
            setSaveState((s) => ({ ...s, status: "error" }));
            break;
          }
        }
      };
    };

    connect();

    const handleOffline = () => setConnected(false);
    const handleOnline = () => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        clearTimeout(reconnectTimer);
        connect();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      clearTypingTimers();
      clearSaveRequest();
      if (socket) socket.close();
    };
  }, [url, reconcile, flash, recompute, resetDocument, clearTypingTimers, clearSaveRequest, markDirty]);

  const editLine = useCallback(
    (id: string, content: string) => {
      if (!isOpen() || !linesRef.current.some((l) => l.id === id)) return;

      const existingQueued = boxRef.current.queued.get(id);
      if (existingQueued) {
        boxRef.current.queued.set(id, { ...existingQueued, content, at: Date.now() });
      } else {
        const serverLine = boxRef.current.server.find((l) => l.id === id);
        const baseVersion = serverLine ? serverLine.version : (boxRef.current.adds.has(id) ? 1 : 1);
        boxRef.current.queued.set(id, { baseVersion, content, at: Date.now() });
      }

      markDirty(); // unsaved from the first keystroke, not only once the server has echoed it
      recompute();

      if (typingTimersRef.current.has(id)) {
        clearTimeout(typingTimersRef.current.get(id)!);
      }
      typingTimersRef.current.set(id, setTimeout(() => {
        typingTimersRef.current.delete(id);
        flushEdit(id);
      }, 600));
    },
    [isOpen, flushEdit, recompute, markDirty]
  );

  const addLine = useCallback(
    (afterId: string, id: string) => {
      if (!isOpen()) return;
      if (!send({ type: "add_line", data: { afterId, id } })) return;
      boxRef.current.adds.set(id, { afterId, at: Date.now() });
      markDirty();
      recompute();
    },
    [isOpen, send, recompute, markDirty]
  );

  const removeLine = useCallback(
    (id: string) => {
      if (!isOpen() || linesRef.current.length <= 1) return;
      if (!send({ type: "remove_line", data: { lineId: id } })) return;
      boxRef.current.removes.set(id, Date.now());
      boxRef.current.queued.delete(id);

      if (typingTimersRef.current.has(id)) {
        clearTimeout(typingTimersRef.current.get(id)!);
        typingTimersRef.current.delete(id);
      }

      markDirty();
      recompute();
    },
    [isOpen, send, recompute, markDirty]
  );

  /**
   * Manual save (Ctrl+S). Text still waiting in the 600 ms typing delay is sent right away,
   * and the save itself goes out only once everything of ours has reached the server, so the
   * file on disk always includes what you just typed.
   */
  const saveDocument = useCallback(() => {
    if (!isOpen()) return;

    saveRequestedRef.current = true;
    setSaveState((s) => ({ ...s, status: "saving" }));

    clearTypingTimers();
    Array.from(boxRef.current.queued.keys()).forEach((id) => flushEdit(id));
    sendSaveIfIdle();

    // If the server never confirms, say so instead of showing "saving…" forever.
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveRequestedRef.current = false;
      saveTimeoutRef.current = null;
      setSaveState((s) => (s.status === "saving" ? { ...s, status: "error" } : s));
    }, SAVE_TIMEOUT_MS);
  }, [isOpen, clearTypingTimers, flushEdit, sendSaveIfIdle]);

  // The wording and colour for the header, worked out from the save state.
  const saveStatus = useMemo<SaveStatus>(() => {
    if (saveState.status === "saving") return { text: "saving…", tone: "dim" };
    if (saveState.status === "error") return { text: "save failed (Ctrl+S to retry)", tone: "err" };
    if (saveState.dirty) return { text: "unsaved changes", tone: "warn" };
    if (saveState.savedAt) return { text: "saved", tone: "ok" };
    return { text: "not saved yet", tone: "dim" };
  }, [saveState]);

  return { lines, connected, conflictId, fileMissing, editLine, addLine, removeLine, saveDocument, saveStatus };
}