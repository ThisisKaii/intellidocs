/** Whether a saved body holds anything a reader would miss: text, a picture or a table. */
export function hasBodyText(html: string | null | undefined): boolean {
  if (!html) return false
  if (/<(img|table)\b/i.test(html)) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length > 0
}
