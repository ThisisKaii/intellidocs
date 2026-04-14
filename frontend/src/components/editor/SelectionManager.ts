
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
  return document.queryCommandState(format)
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
