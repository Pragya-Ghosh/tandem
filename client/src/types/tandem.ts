/** Domain types + the WebSocket wire protocol. */

export interface Line {
  index: number;
  version: number;
  content: string;
}

export type Tab = "general" | "editor";

/* ---------- server -> client ---------- */

export interface EditRejectedPayload {
  lineIndex: number;
  authoritativeLine: Line;
  reason: string;
}

export type ServerMessage =
  | { type: "init"; data: Line[] }
  | { type: "line_updated"; data: Line }
  | { type: "line_added"; data: Line[] }
  | { type: "line_removed"; data: Line[] }
  | { type: "edit_rejected"; data: EditRejectedPayload };

/* ---------- client -> server ---------- */

export interface EditLinePayload {
  lineIndex: number;
  baseVersion: number;
  newContent: string;
}

export interface AddLinePayload {
  afterIndex: number;
}

export interface RemoveLinePayload {
  index: number;
}

export type ClientMessage =
  | { type: "edit_line"; data: EditLinePayload }
  | { type: "add_line"; data: AddLinePayload }
  | { type: "remove_line"; data: RemoveLinePayload };