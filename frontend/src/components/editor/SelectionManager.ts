
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


export function isFormatActive(format: string): boolean {
  // Inline formats — queryCommandState works for these
  const inlineFormats = ['bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript']
  if (inlineFormats.includes(format)) {
    // strikethrough uses 'strikeThrough' internally
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

  return false
}


export function clearSelection() {
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}


export function saveSelectionIfInside(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editor) return
  const anchorNode = selection.anchorNode
  if (anchorNode && editor.contains(anchorNode)) {
    savedRange = selection.getRangeAt(0)
  }
}


export function restoreSelection() {
  const selection = window.getSelection()
  if (!selection || !savedRange) return
  selection.removeAllRanges()
  selection.addRange(savedRange)
}
