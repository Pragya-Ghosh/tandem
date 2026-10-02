const generateId = () => Math.random().toString(36).substring(2, 9);

class DocumentStore {
  constructor(initialLines = []) {
    // Inject stable IDs into the initial document state
    this.lines = initialLines.length > 0 ? initialLines : [
      { id: generateId(), index: 1, version: 1, content: "function initialize() {" },
      { id: generateId(), index: 2, version: 1, content: "  console.log('Tandem is live!');" },
      { id: generateId(), index: 3, version: 1, content: "}" },
    ];
  }

  /* Retrieves the current full document snapshot */
  getSnapshot() {
    return this.lines;
  }

  /**
   * Validates and applies an OCC edit operation.
   */
  applyEdit(lineIndex, baseVersion, newContent) {
    const line = this.lines.find((l) => l.index === lineIndex);

    if (!line) {
      return { success: false, reason: `Line ${lineIndex} does not exist.` };
    }

    if (baseVersion !== line.version) {
      return {
        success: false,
        line,
        reason: "OCC Conflict: Version mismatch. Someone else edited this line first.",
      };
    }

    line.content = newContent;
    line.version += 1;

    return {
      success: true,
      line,
    };
  }

  /**
   * Handles adding a new line (triggered by Enter key).
   * Accepts an optional clientId so the client doesn't lose focus while waiting.
   */
  addLine(afterIndex, clientId) {
    const pos = this.lines.findIndex((l) => l.index === afterIndex);
    const insertIdx = pos !== -1 ? pos + 1 : this.lines.length;

    // Insert a blank line with a stable ID
    this.lines.splice(insertIdx, 0, {
      id: clientId || generateId(),
      index: 0, // temporary
      version: 1,
      content: "",
    });

    // Renumber to maintain 1-based indexing, BUT KEEP THE STABLE IDs
    this.lines = this.lines.map((l, i) => ({ ...l, index: i + 1 }));

    return {
      success: true,
      snapshot: this.lines,
    };
  }

  /**
   * Handles removing a line (triggered by Backspace/Delete).
   */
  removeLine(index) {
    if (this.lines.length <= 1) {
      return { success: false, reason: "Cannot delete the last remaining line." };
    }

    this.lines = this.lines.filter((l) => l.index !== index);
    
    // Renumber remaining lines, BUT KEEP THE STABLE IDs
    this.lines = this.lines.map((l, i) => ({ ...l, index: i + 1 }));

    return {
      success: true,
      snapshot: this.lines,
    };
  }
}

module.exports = DocumentStore;