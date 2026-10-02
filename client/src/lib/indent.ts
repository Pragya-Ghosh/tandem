/** One indent level used by the editor (Tab / Shift+Tab). */
export const INDENT = "  ";

/**
 * How many leading characters Shift+Tab should remove from `content`:
 * a full indent if present, otherwise a single space, otherwise nothing.
 */
export function leadingOutdentSize(content: string): number {
  if (content.startsWith(INDENT)) return INDENT.length;
  if (content.startsWith(" ")) return 1;
  return 0;
}

/** Indents (default) or outdents one line of text. */
export function adjustIndent(content: string, outdent: boolean): string {
  return outdent ? content.slice(leadingOutdentSize(content)) : INDENT + content;
}