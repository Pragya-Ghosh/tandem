import { useCallback, useEffect, useRef, useState } from "react";
import { CONFLICT_FLASH_MS } from "@/lib/config";
import type { ClientMessage, Line, ServerMessage } from "@/types/tandem";

interface TandemSocket {
  lines: Line[];
  connected: boolean;
  /** Index of a line whose edit was just rejected (for a brief highlight). */
  conflictIndex: number | null;
  editLine: (index: number, newContent: string) => void;
  addLine: (afterIndex: number) => void;
  removeLine: (index: number) => void;
}

const replaceLine = (lines: Line[], next: Line): Line[] =>
  lines.map((l) => (l.index === next.index ? next : l));

/**
 * Owns the WebSocket connection and the optimistic-concurrency protocol:
 * edits are applied locally right away, sent with the version they were based on,
 * and overwritten by the server's authoritative line if rejected.
 */
export function useTandemSync(url: string): TandemSocket {
  const [lines, setLines] = useState<Line[]>([]);
  const [connected, setConnected] = useState(false);
  const [conflictIndex, setConflictIndex] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const linesRef = useRef<Line[]>(lines);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  linesRef.current = lines;

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        console.warn("Ignoring malformed message", event.data);
        return;
      }

      switch (message.type) {
        case "init":
          setLines(message.data);
          break;

        case "line_updated":
          setLines((prev) => replaceLine(prev, message.data));
          break;

        // Handle structural synchronization from server
        case "line_added":
        case "line_removed":
          setLines(message.data);
          break;

        case "edit_rejected": {
          const { lineIndex, authoritativeLine, reason } = message.data;
          console.warn(reason);
          setLines((prev) => replaceLine(prev, authoritativeLine));

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
  }, [url]);

  const editLine = useCallback((index: number, newContent: string) => {
    const socket = socketRef.current;
    const target = linesRef.current.find((l) => l.index === index);
    if (!target || !socket || socket.readyState !== WebSocket.OPEN) return;

    // optimistic local update
    setLines((prev) => replaceLine(prev, { ...target, content: newContent }));

    const message: ClientMessage = {
      type: "edit_line",
      data: { lineIndex: index, baseVersion: target.version, newContent },
    };
    socket.send(JSON.stringify(message));
  }, []);

  const addLine = useCallback((afterIndex: number) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const message: ClientMessage = {
      type: "add_line",
      data: { afterIndex },
    };
    socket.send(JSON.stringify(message));
  }, []);

  const removeLine = useCallback((index: number) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const message: ClientMessage = {
      type: "remove_line",
      data: { index },
    };
    socket.send(JSON.stringify(message));
  }, []);

  return { lines, connected, conflictIndex, editLine, addLine, removeLine };
}