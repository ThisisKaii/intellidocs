/**
 * Clean import-only noise without touching blank lines. Word title-page and
 * signature spacing is built from empty paragraphs, so every blank paragraph
 * is preserved exactly as converted; only excessive runs of non-breaking
 * spaces are squeezed.
 */
export function sanitizeImportedHtml(html: string): string {
  return html
    // Clean excessive consecutive non-breaking spaces
    .replace(/(&nbsp;){3,}/g, ' ')
}
