import { useCallback, useEffect, useRef, useState } from "react";
import { CONFLICT_FLASH_MS } from "@/lib/config";
import type { ClientMessage, Line, ServerMessage } from "@/types/tandem";

interface TandemSocket {
  lines: Line[];
  connected: boolean;
  conflictIndex: number | null;
  editLine: (index: number, newContent: string) => void;
  addLine: (afterIndex: number, id?: string) => void;
  removeLine: (index: number) => void;
}

const replaceLine = (lines: Line[], next: Line): Line[] =>
  lines.map((l) => (l.index === next.index ? next : l));

const generateId = () => Math.random().toString(36).substring(2, 9);
const renumber = (lines: Line[]): Line[] => lines.map((l, i) => ({ ...l, index: i + 1 }));

/**
 * Owns the WebSocket connection and the optimistic-concurrency protocol:
 * edits and structural changes (add/remove) are applied locally right away,
 * making the editor completely resilient to Slow 3G network latency.
 */
export function useTandemSync(url: string): TandemSocket {
  const [lines, setLines] = useState<Line[]>([]);
  const [connected, setConnected] = useState(false);
  const [conflictIndex, setConflictIndex] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const linesRef = useRef<Line[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: Line[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        const raw = JSON.parse(event.data);
        if (raw && typeof raw.type === "string") {
          raw.type = raw.type.toLowerCase();
        }
        message = raw as ServerMessage;
      } catch {
        console.warn("Ignoring malformed message", event.data);
        return;
      }

      switch (message.type) {
        case "init":
        case "line_added":
        case "line_removed":
          commit(message.data);
          break;

        case "line_updated": {
          const incoming = message.data;
          const current = linesRef.current.find((l) => l.index === incoming.index);
          if (current && incoming.version < current.version) break;
          commit(replaceLine(linesRef.current, incoming));
          break;
        }

        case "edit_rejected": {
          const { lineIndex, authoritativeLine, reason } = message.data;
          console.warn(reason);
          if (authoritativeLine) {
            commit(replaceLine(linesRef.current, authoritativeLine));
          }

          setConflictIndex(lineIndex);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(
            () => setConflictIndex(null),
            CONFLICT_FLASH_MS
          );
          break;
        }
      }
    };

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      socket.close();
    };
  }, [url, commit]);

  const editLine = useCallback(
    (index: number, newContent: string) => {
      const socket = socketRef.current;
      const target = linesRef.current.find((l) => l.index === index);
      if (!target) return;

      commit(
        replaceLine(linesRef.current, {
          ...target,
          content: newContent,
          version: target.version + 1,
        })
      );

      if (socket?.readyState === WebSocket.OPEN) {
        const message: ClientMessage = {
          type: "edit_line",
          data: { lineIndex: index, baseVersion: target.version, newContent },
        };
        socket.send(JSON.stringify(message));
      }
    },
    [commit]
  );

  const addLine = useCallback(
    (afterIndex: number, id?: string) => {
      const socket = socketRef.current;
      const newId = id || generateId();

      // OPTIMISTIC LOCAL STRUCTURAL UPDATE: Instantly insert line locally
      const currentLines = linesRef.current;
      const pos = currentLines.findIndex((l) => l.index === afterIndex);
      const insertIdx = pos !== -1 ? pos + 1 : currentLines.length;

      const nextLines = [...currentLines];
      nextLines.splice(insertIdx, 0, {
        id: newId,
        index: 0,
        version: 1,
        content: "",
      });
      commit(renumber(nextLines));

      if (socket?.readyState === WebSocket.OPEN) {
        const message: ClientMessage = {
          type: "add_line",
          data: { afterIndex, id: newId },
        };
        socket.send(JSON.stringify(message));
      }
    },
    [commit]
  );

  const removeLine = useCallback(
    (index: number) => {
      const socket = socketRef.current;
      const currentLines = linesRef.current;
      if (currentLines.length <= 1) return;

      // OPTIMISTIC LOCAL STRUCTURAL UPDATE: Instantly remove line locally
      const nextLines = currentLines.filter((l) => l.index !== index);
      commit(renumber(nextLines));

      if (socket?.readyState === WebSocket.OPEN) {
        const message: ClientMessage = {
          type: "remove_line",
          data: { index },
        };
        socket.send(JSON.stringify(message));
      }
    },
    [commit]
  );

  return { lines, connected, conflictIndex, editLine, addLine, removeLine };
}