
let savedRange: Range | null = null

export function getSelection() {
  return window.getSelection()
}

export function hasSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && selection.rangeCount > 0 && selection.toString().length > 0
}

export function getSelectedText(): string {
  const selection = window.getSelection()
  return selection ? selection.toString() : ''
}

/** Check whether a named format is currently active at the cursor. */
export function isFormatActive(format: string): boolean {
  // Inline formats — queryCommandState works for these
  const inlineFormats = ['bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript']
  if (inlineFormats.includes(format)) {
    const cmd = format === 'strikethrough' ? 'strikeThrough' : format
    return document.queryCommandState(cmd)
  }

  // Headings — check formatBlock value
  const headingMap: Record<string, string> = {
    heading1: 'h1', heading2: 'h2', heading3: 'h3',
    heading4: 'h4', heading5: 'h5', heading6: 'h6',
  }
  if (headingMap[format]) {
    const val = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '')
    return val === headingMap[format]
  }

  // Blockquote
  if (format === 'blockquote') {
    const val = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '')
    return val === 'blockquote'
  }

  // Lists
  if (format === 'unordered_list') return document.queryCommandState('insertUnorderedList')
  if (format === 'ordered_list') return document.queryCommandState('insertOrderedList')

  // Alignment
  if (format === 'align-left') return document.queryCommandState('justifyLeft')
  if (format === 'align-center') return document.queryCommandState('justifyCenter')
  if (format === 'align-right') return document.queryCommandState('justifyRight')
  if (format === 'align-justify') return document.queryCommandState('justifyFull')

  return false
}

/** Return the font family currently applied at the cursor (empty string if default). */
export function getCurrentFontFamily(): string {
  try {
    return document.queryCommandValue('fontName') || ''
  } catch {
    return ''
  }
}

/** Return the CSS font-size value at the cursor by inspecting the computed style. */
export function getCurrentFontSize(): string {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return ''

  let node: Node | null = selection.getRangeAt(0).commonAncestorContainer
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement

  if (node instanceof HTMLElement) {
    const computed = window.getComputedStyle(node)
    return computed.fontSize || ''
  }
  return ''
}

/** Return the hex/rgb foreground color at the cursor. */
export function getCurrentFontColor(): string {
  try {
    return document.queryCommandValue('foreColor') || ''
  } catch {
    return ''
  }
}

/** Return true if full (justify) alignment is active at the cursor. */
export function isJustifyFull(): boolean {
  return document.queryCommandState('justifyFull')
}

/** Return the current block tag at the cursor (e.g. 'h1', 'p', 'blockquote'). */
export function getCurrentBlockTag(): string {
  const val = document.queryCommandValue('formatBlock') || ''
  return val.toLowerCase().replace(/[<>]/g, '')
}

export function clearSelection() {
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}

/** Save the current selection range if the anchor is inside the editor element. */
export function saveSelectionIfInside(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editor) return
  const anchorNode = selection.anchorNode
  if (anchorNode && editor.contains(anchorNode)) {
    savedRange = selection.getRangeAt(0)
  }
}

/** Restore the last saved selection range. */
export function restoreSelection() {
  const selection = window.getSelection()
  if (!selection || !savedRange) return
  selection.removeAllRanges()
  selection.addRange(savedRange)
}
