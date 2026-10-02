import { useCallback, useEffect, useRef, useState } from "react";
import { CONFLICT_FLASH_MS } from "@/lib/config";
import type { ClientMessage, Line, ServerMessage } from "@/types/tandem";

interface TandemSocket {
  lines: Line[];
  connected: boolean;
  /** Index of a line whose edit was just rejected (for a brief highlight). */
  conflictIndex: number | null;
  editLine: (index: number, newContent: string) => void;
  addLine: (afterIndex: number, id?: string) => void;
  removeLine: (index: number) => void;
}

const replaceLine = (lines: Line[], next: Line): Line[] =>
  lines.map((l) => (l.index === next.index ? next : l));

/**
 * Owns the WebSocket connection and the optimistic-concurrency protocol:
 * edits are applied locally right away, sent with the version they were based on,
 * and overwritten by the server's authoritative line if rejected.
 *
 * `linesRef` is the source of truth for everything that SENDS (it is updated
 * synchronously by `commit`), while `lines` state exists to re-render the UI.
 */
export function useTandemSync(url: string): TandemSocket {
  const [lines, setLines] = useState<Line[]>([]);
  const [connected, setConnected] = useState(false);
  const [conflictIndex, setConflictIndex] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const linesRef = useRef<Line[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The only place `lines` changes: keeps the ref and the state in step. */
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
        // Full snapshots: the initial document, a resync, or a structural change.
        case "init":
        case "line_added":
        case "line_removed":
          commit(message.data);
          break;

        case "line_updated": {
          const incoming = message.data;
          const current = linesRef.current.find((l) => l.index === incoming.index);
          // We bump versions optimistically (see editLine), so we can be ahead of
          // the server. An echo of one of our own earlier keystrokes would
          // otherwise roll the line back.
          if (current && incoming.version < current.version) break;
          commit(replaceLine(linesRef.current, incoming));
          break;
        }

        case "edit_rejected": {
          const { lineIndex, authoritativeLine, reason } = message.data;
          console.warn(reason);
          // The server omits the line when it no longer exists; it sends a
          // snapshot in that case, so there is nothing to replace here.
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

  /**
   * Edit a line's text. Applied locally at once, then sent with the version it was
   * based on. The local version is bumped too, so a keystroke typed before the
   * server has answered is based on our own previous edit instead of colliding
   * with it (which would make the server reject us for conflicting with ourselves).
   */
  const editLine = useCallback(
    (index: number, newContent: string) => {
      const socket = socketRef.current;
      const target = linesRef.current.find((l) => l.index === index);
      if (!target || !socket || socket.readyState !== WebSocket.OPEN) return;

      commit(
        replaceLine(linesRef.current, {
          ...target,
          content: newContent,
          version: target.version + 1,
        })
      );

      const message: ClientMessage = {
        type: "edit_line",
        data: { lineIndex: index, baseVersion: target.version, newContent },
      };
      socket.send(JSON.stringify(message));
    },
    [commit]
  );

  /** Insert an empty line after `afterIndex`; `id` is the client-chosen line id. */
  const addLine = useCallback((afterIndex: number, id?: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const message: ClientMessage = {
      type: "add_line",
      data: { afterIndex, id },
    };
    socket.send(JSON.stringify(message));
  }, []);

  /** Remove the line at `index`. */
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