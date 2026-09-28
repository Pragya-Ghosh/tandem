class DocumentStore {
  constructor(initialLines = []) {
    this.lines = initialLines.length > 0 ? initialLines : [
      { index: 0, version: 1, content: "function initialize() {" },
      { index: 1, version: 1, content: "  console.log('Tandem is live!');" },
      { index: 2, version: 1, content: "}" },
    ];
  }

  /* Retrieves the current full document snapshot*/
  getSnapshot() {
    return this.lines;
  }

  /**
   * Validates and applies an OCC edit operation.
   * @param {number} lineIndex 
   * @param {number} baseVersion 
   * @param {string} newContent 
   * @returns {{ success: boolean, line?: object, reason?: string }}
   */
  applyEdit(lineIndex, baseVersion, newContent) {
    const line = this.lines[lineIndex];

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
}

module.exports = DocumentStore;