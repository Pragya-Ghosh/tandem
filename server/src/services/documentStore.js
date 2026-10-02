const generateId = () => Math.random().toString(36).substring(2, 9);

/** Limits so one client can't bloat the document or the broadcast payloads. */
const MAX_LINES = 10000;
const MAX_LINE_LENGTH = 10000;
const MAX_ID_LENGTH = 64;

/**
 * In-memory document: an ordered list of lines `{ id, index, version, content }`.
 *  - `index` is the 1-based position and is renumbered after every structural change.
 *  - `id` is stable for the life of a line, so clients can keep track of it.
 *  - `version` goes up by one on every accepted edit (optimistic concurrency).
 */
class DocumentStore {
  constructor(initialLines = []) {
    this.lines =
      initialLines.length > 0
        ? initialLines.map((l, i) => ({ ...l, id: l.id ?? generateId(), index: i + 1 }))
        : [
            { id: generateId(), index: 1, version: 1, content: "function initialize() {" },
            { id: generateId(), index: 2, version: 1, content: "  console.log('Tandem is live!');" },
            { id: generateId(), index: 3, version: 1, content: "}" },
          ];
  }

  /** The current full document. */
  getSnapshot() {
    return this.lines;
  }

  /**
   * Applies an edit if it was based on the line's current version.
   *
   * Returns one of:
   *   { success: true,  line }                     edit applied
   *   { success: false, line, reason }             version conflict (line = current server copy)
   *   { success: false, reason, missing: true }    the line doesn't exist (no `line`)
   *   { success: false, reason }                   invalid input
   */
  applyEdit(lineIndex, baseVersion, newContent) {
    if (typeof newContent !== "string" || newContent.length > MAX_LINE_LENGTH) {
      return { success: false, reason: "Invalid or oversized line content." };
    }

    const line = this.lines.find((l) => l.index === lineIndex);

    if (!line) {
      return { success: false, missing: true, reason: `Line ${lineIndex} does not exist.` };
    }

    if (baseVersion !== line.version) {
      return {
        success: false,
        line: { ...line },
        reason: "OCC Conflict: Version mismatch. Someone else edited this line first.",
      };
    }

    line.content = newContent;
    line.version += 1;

    return { success: true, line: { ...line } };
  }

  /**
   * Inserts a blank line after `afterIndex` (Enter key).
   * `clientId` lets the client name the new line so it keeps its identity while the
   * server's answer is in flight. It is ignored if it is invalid or already in use.
   */
  addLine(afterIndex, clientId) {
    if (this.lines.length >= MAX_LINES) {
      return { success: false, reason: "Document is full." };
    }

    const pos = this.lines.findIndex((l) => l.index === afterIndex);
    const insertIdx = pos !== -1 ? pos + 1 : this.lines.length;

    const idIsUsable =
      typeof clientId === "string" &&
      clientId.length > 0 &&
      clientId.length <= MAX_ID_LENGTH &&
      !this.lines.some((l) => l.id === clientId);

    this.lines.splice(insertIdx, 0, {
      id: idIsUsable ? clientId : generateId(),
      index: 0, // fixed by the renumber below
      version: 1,
      content: "",
    });

    // Renumber to keep 1-based indexing; ids stay as they are.
    this.lines = this.lines.map((l, i) => ({ ...l, index: i + 1 }));

    return { success: true, snapshot: this.lines };
  }

  /** Removes the line at `index` (Backspace on an empty line, delete selection). */
  removeLine(index) {
    if (this.lines.length <= 1) {
      return { success: false, reason: "Cannot delete the last remaining line." };
    }

    if (!this.lines.some((l) => l.index === index)) {
      return { success: false, reason: `Line ${index} does not exist.` };
    }

    this.lines = this.lines
      .filter((l) => l.index !== index)
      .map((l, i) => ({ ...l, index: i + 1 }));

    return { success: true, snapshot: this.lines };
  }
}

module.exports = DocumentStore;