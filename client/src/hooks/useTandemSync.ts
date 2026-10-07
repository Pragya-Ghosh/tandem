import { useCallback, useEffect, useRef, useState } from "react";
import { CONFLICT_FLASH_MS } from "@/lib/config";
import type { ClientMessage, Line, ServerMessage } from "@/types/tandem";

interface TandemSocket {
  lines: Line[];
  connected: boolean;
  conflictId: string | null;
  editLine: (id: string, content: string) => void;
  addLine: (afterId: string, id: string) => void;
  removeLine: (id: string) => void;
}

interface Outbox {
  server: Line[];
  inFlight: Map<string, { baseVersion: number; content: string; at: number }>;
  queued: Map<string, { baseVersion: number; content: string; at: number }>;
  adds: Map<string, { afterId: string; at: number }>;
  removes: Map<string, number>;
}

const PROTOCOL_VERSION = 2;
const EDIT_TIMEOUT_MS = 60_000;
const STRUCTURAL_TIMEOUT_MS = 120_000;

const emptyOutbox = (): Outbox => ({
  server: [],
  inFlight: new Map(),
  queued: new Map(),
  adds: new Map(),
  removes: new Map(),
});

/** CORE FIX: Helper to guarantee every line object always has a valid timestamp */
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

  // CORE FIX: Sanitize all server lines on entry to rebase
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

export function useTandemSync(url: string): TandemSocket {
  const [lines, setLines] = useState<Line[]>([]);
  const [connected, setConnected] = useState(false);
  const [conflictId, setConflictId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const linesRef = useRef<Line[]>([]);
  const boxRef = useRef<Outbox>(emptyOutbox());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
    recompute();
  }, [flushEdit, recompute]);

  useEffect(() => {
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
      
      socket.onclose = () => {
        if (socketRef.current === socket) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 2000);
        }
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
            // CORE FIX: Sanitize incoming server arrays instantly
            box.server = Array.isArray(message.data) 
              ? message.data.map((l) => sanitizeLine(l))
              : [];
            reconcile();
            break;

          case "line_updated": {
            // CORE FIX: Sanitize single updated line instantly
            const updated = sanitizeLine(message.data);
            box.server = box.server.map((l) =>
              l.id === updated.id && updated.version >= l.version ? updated : l
            );
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
      typingTimersRef.current.forEach(clearTimeout);
      if (socket) socket.close();
    };
  }, [url, reconcile, flash]);

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

      recompute(); 

      if (typingTimersRef.current.has(id)) {
        clearTimeout(typingTimersRef.current.get(id)!);
      }
      typingTimersRef.current.set(id, setTimeout(() => {
        typingTimersRef.current.delete(id);
        flushEdit(id);
      }, 600));
    },
    [isOpen, flushEdit, recompute]
  );

  const addLine = useCallback(
    (afterId: string, id: string) => {
      if (!isOpen()) return;
      if (!send({ type: "add_line", data: { afterId, id } })) return;
      boxRef.current.adds.set(id, { afterId, at: Date.now() });
      recompute();
    },
    [isOpen, send, recompute]
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
      
      recompute();
    },
    [isOpen, send, recompute]
  );

  return { lines, connected, conflictId, editLine, addLine, removeLine };
}