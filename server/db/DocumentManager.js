const fs = require('fs');
const path = require('path');
const DocumentStore = require('../src/services/documentStore');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * A file id becomes part of a path on disk, so it must be a plain token: letters,
 * digits, "_" and "-" only. This also blocks things like "../../etc/passwd".
 */
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Keeps one live DocumentStore per file and writes it to disk ONLY when asked (manual save).
 *
 *   entry = { store, dirty, savedAt }
 *   dirty    true when the in-memory document has changes that are not on disk yet
 *   savedAt  when it was last written (ms since epoch), or null if it never was
 */
class DocumentManager {
  constructor() {
    this.entries = new Map();
  }

  isValidFileId(fileId) {
    return typeof fileId === 'string' && FILE_ID_PATTERN.test(fileId);
  }

  _filePath(fileId) {
    return path.join(DATA_DIR, `${fileId}.json`);
  }

  /** The live entry for a file: from memory, else from disk, else a brand-new blank document. */
  _entry(fileId) {
    const existing = this.entries.get(fileId);
    if (existing) return existing;

    if (!this.isValidFileId(fileId)) {
      throw new Error(`Invalid file id: ${fileId}`);
    }

    const filePath = this._filePath(fileId);
    let lines = null;
    let savedAt = null;

    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          lines = parsed;
          savedAt = fs.statSync(filePath).mtimeMs;
        }
      } catch (err) {
        // Don't silently overwrite a damaged file on the next save: keep a copy.
        const backup = `${filePath}.corrupt-${Date.now()}`;
        try { fs.renameSync(filePath, backup); } catch (_) { /* ignore */ }
        console.error(`[DB] Could not read ${fileId} (${err.message}). Kept a copy at ${backup}`);
      }
    }

    // A new file starts as ONE empty line (not the sample code).
    const store = new DocumentStore(lines ?? [{ version: 1, content: '' }]);
    const entry = { store, dirty: false, savedAt };
    this.entries.set(fileId, entry);
    return entry;
  }

  /** The live DocumentStore for a file (loads it on first use). */
  getDocument(fileId) {
    return this._entry(fileId).store;
  }

  /** { dirty, savedAt } for a file. */
  getStatus(fileId) {
    const { dirty, savedAt } = this._entry(fileId);
    return { dirty, savedAt };
  }

  /** Call after any accepted change. */
  markDirty(fileId) {
    this._entry(fileId).dirty = true;
  }

  /**
   * Writes the document to disk. The write goes to a temp file first and is then
   * renamed over the real one, so a crash mid-write can't leave a half-written file.
   * Returns { success: true, savedAt } or { success: false, reason }.
   */
  saveDocument(fileId) {
    try {
      const entry = this._entry(fileId);
      const filePath = this._filePath(fileId);
      const tmpPath = `${filePath}.${process.pid}.tmp`;

      fs.writeFileSync(tmpPath, JSON.stringify(entry.store.getSnapshot(), null, 2));
      fs.renameSync(tmpPath, filePath);

      entry.dirty = false;
      entry.savedAt = Date.now();
      return { success: true, savedAt: entry.savedAt };
    } catch (err) {
      console.error(`[DB] Failed to save ${fileId}:`, err);
      return { success: false, reason: 'The server could not write the file.' };
    }
  }
}

module.exports = new DocumentManager();