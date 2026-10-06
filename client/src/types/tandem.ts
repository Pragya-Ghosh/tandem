/** Domain types + the WebSocket wire protocol. */

export interface Line {
  /** Stable identity for the life of the line. Edits are addressed by this. */
  id: string;
  /** 1-based position; changes when lines are added or removed. */
  index: number;
  /** Increases by one on every accepted edit (optimistic concurrency). */
  version: number;
  content: string;
}

export type Tab = "general" | "editor";

/* ---------- server -> client ---------- */

export interface EditRejectedPayload {
  lineId: string;
  lineIndex: number;
  /** Current server copy of the line (absent if the line no longer exists). */
  authoritativeLine?: Line;
  reason: string;
}

export type ServerMessage =
  /** Full snapshots: initial load, resync, or a structural change. */
  | { type: "init" | "line_added" | "line_removed"; data: Line[]; protocol?: number }
  | { type: "line_updated"; data: Line }
  | { type: "edit_rejected"; data: EditRejectedPayload };

/* ---------- client -> server ---------- */

export type ClientMessage =
  | { type: "edit_line"; data: { lineId: string; baseVersion: number; newContent: string } }
  | { type: "add_line"; data: { afterId: string; id: string } }
  | { type: "remove_line"; data: { lineId: string } };