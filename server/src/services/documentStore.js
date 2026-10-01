class DocumentStore {
  constructor(initialLines = []) {
    this.lines = initialLines.length > 0 ? initialLines : [
      { index: 1, version: 1, content: "function initialize() {" },
      { index: 2, version: 1, content: "  console.log('Tandem is live!');" },
      { index: 3, version: 1, content: "}" },
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
    // Safely find the line by its index property rather than raw array offset
    const line = this.lines.find((l) => l.index === lineIndex);

    if (!line) {
      return { success: false, reason: `Line ${lineIndex} does not exist.` };
    }

    // --- OCC VALIDATION ---
    if (baseVersion !== line.version) {
      return {
        success: false,
        line,
        reason: "OCC Conflict: Version mismatch. Someone else edited this line first.",
      };
    }

    // Accept and Mutate
    line.content = newContent;
    line.version += 1;

    return {
      success: true,
      line,
    };
  }

  /**
   * Handles adding a new line (triggered by Enter key).
   */
  addLine(afterIndex) {
    const pos = this.lines.findIndex((l) => l.index === afterIndex);
    const insertIdx = pos !== -1 ? pos + 1 : this.lines.length;

    // Insert a blank line
    this.lines.splice(insertIdx, 0, {
      index: 0, // temporary
      version: 1,
      content: "",
    });

    // Renumber to maintain clean 1-based indexing
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
    
    // Renumber remaining lines
    this.lines = this.lines.map((l, i) => ({ ...l, index: i + 1 }));

    return {
      success: true,
      snapshot: this.lines,
    };
  }
}

module.exports = DocumentStore;