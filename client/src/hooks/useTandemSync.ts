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
  queued: Map<string, { baseVersion: number; content: string }>;
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

function rebase(box: Outbox): Line[] {
  const serverIds = new Set(box.server.map((l) => l.id));
  const newLine = (id: string): Line => ({ id, index: 0, version: 1, content: "" });

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
    const stack = [...(addedAfter.get(afterId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (placed.has(id)) continue;
      out.push(newLine(id));
      placed.add(id);
      stack.push(...(addedAfter.get(id) ?? []));
    }
  };

  box.server.forEach((l) => {
    out.push({ ...l });
    placeAddsAfter(l.id);
  });

  box.adds.forEach((_, id) => {
    if (serverIds.has(id) || placed.has(id)) return;
    out.push(newLine(id));
    placed.add(id);
    placeAddsAfter(id);
  });

  if (box.removes.size > 0) out = out.filter((l) => !box.removes.has(l.id));

  out = out.map((l) => {
    const pending = box.queued.get(l.id)?.content ?? box.inFlight.get(l.id)?.content;
    return pending === undefined ? l : { ...l, content: pending, version: l.version + 1 };
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
      box.inFlight.set(id, { baseVersion: queuedEdit.baseVersion, content: queuedEdit.content, at: Date.now() });
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
      const acked = !!line && line.version === f.baseVersion + 1 && line.content === f.content;
      
      if (acked) {
        const q = box.queued.get(id);
        if (q) {
          q.baseVersion = line.version;
        }
      }

      if (lineGone || acked || now - f.at > EDIT_TIMEOUT_MS) {
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
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current === socket) setConnected(true);
    };
    socket.onclose = () => {
      if (socketRef.current === socket) setConnected(false);
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
          box.server = message.data;
          reconcile();
          break;

        case "line_updated": {
          const updated = message.data;
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
            const id = authoritativeLine.id;
            box.server = box.server.map((l) =>
              l.id === id && authoritativeLine.version >= l.version ? authoritativeLine : l
            );
            
            // STRICT OCC ENFORCEMENT: First writer to the server wins.
            // Drop our pending changes immediately so our UI seamlessly snaps
            // to the authoritative text of the fast client and never overwrites them.
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

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      typingTimersRef.current.forEach(clearTimeout);
      socket.close();
    };
  }, [url, reconcile, flash]);

  const editLine = useCallback(
    (id: string, content: string) => {
      if (!isOpen() || !linesRef.current.some((l) => l.id === id)) return;
      
      const existingQueued = boxRef.current.queued.get(id);
      if (existingQueued) {
        boxRef.current.queued.set(id, { ...existingQueued, content });
      } else {
        const serverLine = boxRef.current.server.find((l) => l.id === id);
        const baseVersion = serverLine ? serverLine.version : (boxRef.current.adds.has(id) ? 1 : 1);
        boxRef.current.queued.set(id, { baseVersion, content });
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