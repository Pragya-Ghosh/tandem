const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Kept your original import path for DocumentStore
const DocumentStore = require('../src/services/documentStore');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * A file id becomes part of a path on disk, so it must be a plain token: letters,
 * digits, "_" and "-" only. This also blocks things like "../../etc/passwd".
 */
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** The only files in the data folder that count as documents (not temp or backup files). */
const DATA_FILE_PATTERN = /^([A-Za-z0-9_-]{1,64})\.json$/;
const MAX_NAME_LENGTH = 100;

/**
 * Owns every document. The SERVER decides what files exist and what they are called, so every
 * browser sees the same list:
 *
 *   data/<id>.json   { "name": "hello.txt", "lines": [ ... ] }
 *                    (older files are a bare array of lines; they are shown under their id)
 *
 * It also keeps one live DocumentStore per open file and writes it to disk ONLY when asked
 * (manual save).  entry = { store, name, dirty, savedAt }
 *
 * Emits 'deleted' (fileId) when a file is deleted, so open connections can be closed.
 */
class DocumentManager extends EventEmitter {
  constructor() {
    super();
    this.entries = new Map();
  }

  isValidFileId(fileId) {
    return typeof fileId === 'string' && FILE_ID_PATTERN.test(fileId);
  }

  _filePath(fileId) {
    return path.join(DATA_DIR, `${fileId}.json`);
  }

  /** True if this file exists on disk. */
  fileExists(fileId) {
    return this.isValidFileId(fileId) && fs.existsSync(this._filePath(fileId));
  }

  /** Reads a data file. Understands the old format (bare array) and the current one. */
  _readFile(fileId) {
    const parsed = JSON.parse(fs.readFileSync(this._filePath(fileId), 'utf-8'));
    if (Array.isArray(parsed)) return { name: fileId, lines: parsed };
    if (parsed && Array.isArray(parsed.lines)) {
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : fileId;
      return { name, lines: parsed.lines };
    }
    throw new Error('Unrecognised file format');
  }

  /** Writes a data file via a temp file + rename, so a crash can't leave half a file. */
  _writeFile(fileId, name, lines) {
    const filePath = this._filePath(fileId);
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify({ name, lines }, null, 2));
    fs.renameSync(tmpPath, filePath);
  }

  /** Every file on disk as { id, name, updatedAt }, most recently saved first. */
  listFiles() {
    const files = [];
    for (const entryName of fs.readdirSync(DATA_DIR)) {
      const match = DATA_FILE_PATTERN.exec(entryName);
      if (!match) continue;
      const id = match[1];
      try {
        const live = this.entries.get(id);
        const name = live ? live.name : this._readFile(id).name;
        files.push({ id, name, updatedAt: fs.statSync(this._filePath(id)).mtimeMs });
      } catch (err) {
        console.error(`[DB] Skipping unreadable file ${entryName}: ${err.message}`);
      }
    }
    return files.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  _cleanName(name) {
    if (typeof name !== 'string') return null;
    const clean = name.trim();
    // eslint-disable-next-line no-control-regex
    if (!clean || clean.length > MAX_NAME_LENGTH || /[\u0000-\u001f]/.test(clean)) return null;
    return clean;
  }

  _findByName(name, exceptId) {
    const wanted = name.toLowerCase();
    return this.listFiles().find((f) => f.id !== exceptId && f.name.trim().toLowerCase() === wanted);
  }

  /**
   * Creates a file on disk right away, so it exists for everyone and keeps its name.
   * If a file with this name already exists (ignoring upper/lower case) it is returned instead:
   * one name, one file.  Returns { success, created, file } or { success: false, status, reason }.
   */
  createFile(name) {
    const clean = this._cleanName(name);
    if (!clean) {
      return { success: false, status: 400, reason: `A file name is required (1-${MAX_NAME_LENGTH} characters).` };
    }

    const existing = this._findByName(clean);
    if (existing) return { success: true, created: false, file: existing };

    const slug =
      clean.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+\$/g, '').slice(0, 50) || 'file';
    let id;
    do {
      id = `${slug}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
    } while (this.fileExists(id));

    // A new file starts as ONE empty line (not the sample code).
    const blank = new DocumentStore([{ version: 1, content: '' }]).getSnapshot();
    this._writeFile(id, clean, blank);

    return {
      success: true,
      created: true,
      file: { id, name: clean, updatedAt: fs.statSync(this._filePath(id)).mtimeMs },
    };
  }

  /** Renames a file. Only the name changes: unsaved edits are NOT written as a side effect. */
  renameFile(fileId, name) {
    if (!this.fileExists(fileId)) return { success: false, status: 404, reason: 'File not found.' };

    const clean = this._cleanName(name);
    if (!clean) {
      return { success: false, status: 400, reason: `A file name is required (1-${MAX_NAME_LENGTH} characters).` };
    }
    if (this._findByName(clean, fileId)) {
      return { success: false, status: 409, reason: `A file called "${clean}" already exists.` };
    }

    const onDisk = this._readFile(fileId);
    this._writeFile(fileId, clean, onDisk.lines);
    const live = this.entries.get(fileId);
    if (live) live.name = clean;

    return { success: true, file: { id: fileId, name: clean, updatedAt: fs.statSync(this._filePath(fileId)).mtimeMs } };
  }

  /** Deletes a file from disk and memory, and tells open connections (they are closed). */
  deleteFile(fileId) {
    if (!this.fileExists(fileId)) return { success: false, status: 404, reason: 'File not found.' };

    fs.unlinkSync(this._filePath(fileId));
    this.entries.delete(fileId);
    this.emit('deleted', fileId);
    return { success: true };
  }

  /** The live entry for a file: from memory, else loaded from disk. The file must exist. */
  _entry(fileId) {
    const existing = this.entries.get(fileId);
    if (existing) return existing;

    if (!this.fileExists(fileId)) {
      throw new Error(`File not found: ${fileId}`);
    }

    const filePath = this._filePath(fileId);
    let data = null;
    try {
      data = this._readFile(fileId);
    } catch (err) {
      // Don't silently overwrite a damaged file on the next save: keep a copy.
      const backup = `${filePath}.corrupt-${Date.now()}`;
      try { fs.renameSync(filePath, backup); } catch (_) { /* ignore */ }
      console.error(`[DB] Could not read ${fileId} (${err.message}). Kept a copy at ${backup}`);
    }

    const lines = data && data.lines.length > 0 ? data.lines : [{ version: 1, content: '' }];
    const entry = {
      store: new DocumentStore(lines),
      name: data ? data.name : fileId,
      dirty: false,
      savedAt: data ? fs.statSync(filePath).mtimeMs : null,
    };
    this.entries.set(fileId, entry);
    return entry;
  }

  /** The live DocumentStore for a file. */
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

  /** Writes the document to disk (manual save). Returns { success, savedAt } or { success: false, reason }. */
  saveDocument(fileId) {
    try {
      const entry = this._entry(fileId);
      this._writeFile(fileId, entry.name, entry.store.getSnapshot());
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