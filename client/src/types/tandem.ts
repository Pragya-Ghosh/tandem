/** Domain types + the WebSocket wire protocol. */

export interface Line {
  id: string; 
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
  | { type: "init" | "INIT"; data: Line[] }
  | { type: "line_updated" | "LINE_UPDATED"; data: Line }
  | { type: "line_added" | "LINE_ADDED"; data: Line[] }
  | { type: "line_removed" | "LINE_REMOVED"; data: Line[] }
  | { type: "edit_rejected" | "EDIT_REJECTED"; data: EditRejectedPayload };

/* ---------- client -> server ---------- */

export interface EditLinePayload {
  lineIndex: number;
  baseVersion: number;
  newContent: string;
}

export interface AddLinePayload {
  afterIndex: number;
  id?: string;
}

export interface RemoveLinePayload {
  index: number;
}

export type ClientMessage =
  | { type: "edit_line"; data: EditLinePayload }
  | { type: "add_line"; data: AddLinePayload }
  | { type: "remove_line"; data: RemoveLinePayload };