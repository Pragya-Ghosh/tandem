const generateId = () => Math.random().toString(36).substring(2, 9);

/** Limits so one client can't bloat the document or the broadcast payloads. */
const MAX_LINES = 10000;
const MAX_LINE_LENGTH = 10000;
const MAX_ID_LENGTH = 64;

/**
 * In-memory document: an ordered list of lines `{ id, index, version, content }`.
 *  - `id` is stable for the life of a line. ALL operations address lines by id,
 *    because line numbers shift whenever another client adds or removes a line.
 *  - `index` is the 1-based position, renumbered after every structural change.
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
   *   { success: false, reason }                   line missing or input invalid
   */
  applyEdit(lineId, baseVersion, newContent) {
    if (typeof newContent !== "string" || newContent.length > MAX_LINE_LENGTH) {
      return { success: false, reason: "Invalid or oversized line content." };
    }

    const line = this.lines.find((l) => l.id === lineId);

    if (!line) {
      return { success: false, reason: `Line ${lineId} does not exist.` };
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
   * Inserts a blank line with the client-chosen id `clientId` after the line
   * `afterId` (at the end if that line no longer exists).
   * Idempotent: if `clientId` already exists the document is left unchanged.
   */
  addLine(afterId, clientId) {
    const idIsValid =
      typeof clientId === "string" && clientId.length > 0 && clientId.length <= MAX_ID_LENGTH;

    if (!idIsValid) {
      return { success: false, reason: "A valid line id is required." };
    }

    if (this.lines.some((l) => l.id === clientId)) {
      return { success: true, snapshot: this.lines };
    }

    if (this.lines.length >= MAX_LINES) {
      return { success: false, reason: "Document is full." };
    }

    const pos = this.lines.findIndex((l) => l.id === afterId);
    const insertIdx = pos !== -1 ? pos + 1 : this.lines.length;

    this.lines.splice(insertIdx, 0, {
      id: clientId,
      index: 0, // fixed by the renumber below
      version: 1,
      content: "",
    });

    this.lines = this.lines.map((l, i) => ({ ...l, index: i + 1 }));

    return { success: true, snapshot: this.lines };
  }

  /** Removes a line by id. The last remaining line can't be removed. */
  removeLine(lineId) {
    if (this.lines.length <= 1) {
      return { success: false, reason: "Cannot delete the last remaining line." };
    }

    if (!this.lines.some((l) => l.id === lineId)) {
      return { success: false, reason: `Line ${lineId} does not exist.` };
    }

    this.lines = this.lines
      .filter((l) => l.id !== lineId)
      .map((l, i) => ({ ...l, index: i + 1 }));

    return { success: true, snapshot: this.lines };
  }
}

module.exports = DocumentStore;