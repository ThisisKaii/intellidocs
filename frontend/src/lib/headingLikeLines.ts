/**
 * Section titles a document styles as bold paragraphs instead of headings
 * ("Statement of the Problem", "Significance of the Study"), in document order.
 *
 * Only top-level paragraphs count (not table cells or list items): short, every
 * word bold, and not a figure or table caption. This mirrors the editor's
 * `isHeadingLikeParagraph`, so the assistant's outline names the same sections
 * the chat can format.
 */
export function headingLikeLines(html: string): string[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const lines: string[] = []
  for (const element of Array.from(body.children)) {
    if (element.tagName !== 'P') continue
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    const words = text.split(' ').filter(Boolean).length
    if (words === 0 || words > 12 || /^(?:figure|table)\s+\d/i.test(text)) continue
    if (/[.!?]$/.test(text) && (words > 6 || /[!?]$/.test(text))) continue
    if (!isAllBold(element)) continue
    lines.push(text)
  }
  return lines
}

/** True when every non-blank text run of the element sits inside <strong> or <b>. */
function isAllBold(element: Element): boolean {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let sawText = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent ?? '').trim()) continue
    sawText = true
    if (!node.parentElement?.closest('strong, b')) return false
  }
  return sawText
}
