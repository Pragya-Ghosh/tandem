import type { Tab } from "@/types/tandem";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:5000";

export const APP_VERSION = "tandem-0.1.0";
export const DOCUMENT_NAME = "main.js";
export const DOCUMENT_PATH = "/workspace/cse31/main.js";

/** How long a rejected line stays highlighted. */
export const CONFLICT_FLASH_MS = 1000;

export const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
];