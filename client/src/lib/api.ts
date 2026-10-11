import { WS_URL } from "@/lib/config";

/** 
 * Automatically resolves the API URL: targets port 5000 locally, 
 * or converts WS_URL / WSS_URL dynamically for production.
 */
const getApiUrl = () => {
  // If running locally, explicitly point to the Express backend on port 5000
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return "http://localhost:5000";
  }
  // Fallback to converting the WS_URL for production
  return WS_URL.replace(/^ws/, "http").replace(/\/+$/, "");
};

export const API_URL = getApiUrl();

/** A file as the server reports it. */
export interface ServerFile {
  id: string;
  name: string;
  /** When it was last saved on the server (ms since epoch). */
  updatedAt: number;
}

/** A failed request. `status` is the HTTP status, or 0 if the server couldn't be reached. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    console.error(`[API] Fetch failed for ${API_URL}${path}:`, err);
    throw new ApiError("Could not reach the server. Is it running?", 0);
  }

  if (!res.ok) {
    let message = `The server answered ${res.status}.`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      /* no JSON body: keep the generic message */
    }
    throw new ApiError(message, res.status);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Every file on the server, newest first. */
export const listFiles = () => request<ServerFile[]>("/api/files");

/** Creates a file (or returns the existing one with that name: one name, one file). */
export const createFile = (name: string) =>
  request<ServerFile>("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

/** Deletes a file for everyone. */
export const deleteFile = (id: string) =>
  request<void>(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });