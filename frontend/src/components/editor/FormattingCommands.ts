
/** Get the current block-level tag at the cursor. */
function getCurrentBlockTag(): string {
  const value = document.queryCommandValue('formatBlock')
  return typeof value === 'string' ? value.toLowerCase() : ''
}

/** Reset to plain paragraph, removing list/blockquote wrappers. */
function normalizeBlock() {
  if (document.queryCommandState('insertUnorderedList')) {
    document.execCommand('insertUnorderedList', false, undefined)
  }

  if (document.queryCommandState('insertOrderedList')) {
    document.execCommand('insertOrderedList', false, undefined)
  }

  document.execCommand('formatBlock', false, '<p>')
}

// ─── Inline formats ────────────────────────────────────────────────────────

export function bold() {
  document.execCommand('bold', false, undefined)
}

export function italic() {
  document.execCommand('italic', false, undefined)
}

export function underline() {
  document.execCommand('underline', false, undefined)
}

export function strikethrough() {
  document.execCommand('strikeThrough', false, undefined)
}

export function superscript() {
  document.execCommand('superscript', false, undefined)
}

export function subscript() {
  document.execCommand('subscript', false, undefined)
}

// ─── Font controls ─────────────────────────────────────────────────────────

/** Apply a font family to the current selection. */
export function fontFamily(family: string) {
  document.execCommand('fontName', false, family)
}

/** Apply a font size (1–7 HTML size or 'Xpt' string) to the current selection.
 *  We use a workaround: wrap in a span with inline style for pt sizes. */
export function fontSize(size: string) {
  // execCommand fontSize only accepts 1-7; use span workaround for pt values
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    document.execCommand('fontSize', false, size)
    return
  }
  document.execCommand('insertHTML', false,
    `<span style="font-size:${size}">${selection.toString()}</span>`
  )
}

/** Apply a text (foreground) color to the current selection. */
export function fontColor(color: string) {
  document.execCommand('foreColor', false, color)
}

/** Apply a background highlight color to the current selection. */
export function highlightColor(color: string) {
  document.execCommand('hiliteColor', false, color)
}

/** Remove all inline and block-level formatting from the selection. */
export function clearFormatting() {
  document.execCommand('removeFormat', false, undefined)
  normalizeBlock()
}

// ─── Block formats ─────────────────────────────────────────────────────────

export function heading1() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h1>')
}

export function heading2() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h2>')
}

export function heading3() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h3>')
}

export function heading4() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h4>')
}

export function heading5() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h5>')
}

export function heading6() {
  normalizeBlock()
  document.execCommand('formatBlock', false, '<h6>')
}

/** Apply a heading level or revert to paragraph. Accepts 'p','h1'…'h6'. */
export function applyBlockFormat(tag: string) {
  normalizeBlock()
  document.execCommand('formatBlock', false, `<${tag}>`)
}

export function blockquote() {
  const current = getCurrentBlockTag()
  if (current === 'blockquote') {
    document.execCommand('formatBlock', false, '<p>')
    return
  }
  normalizeBlock()
  document.execCommand('formatBlock', false, '<blockquote>')
}

export function codeBlock() {
  const current = getCurrentBlockTag()
  if (current === 'pre') {
    document.execCommand('formatBlock', false, '<p>')
    return
  }
  normalizeBlock()
  document.execCommand('formatBlock', false, '<pre>')
}

// ─── Lists ─────────────────────────────────────────────────────────────────

export function bulletList() {
  if (document.queryCommandState('insertUnorderedList')) {
    document.execCommand('insertUnorderedList', false, undefined)
    document.execCommand('formatBlock', false, '<p>')
    return
  }
  normalizeBlock()
  document.execCommand('insertUnorderedList', false, undefined)
}

export function numberedList() {
  if (document.queryCommandState('insertOrderedList')) {
    document.execCommand('insertOrderedList', false, undefined)
    document.execCommand('formatBlock', false, '<p>')
    return
  }
  normalizeBlock()
  document.execCommand('insertOrderedList', false, undefined)
}

// ─── Alignment ─────────────────────────────────────────────────────────────

export function alignLeft() {
  document.execCommand('justifyLeft', false, undefined)
}

export function alignCenter() {
  document.execCommand('justifyCenter', false, undefined)
}

export function alignRight() {
  document.execCommand('justifyRight', false, undefined)
}

/** Full / justify alignment. */
export function alignJustify() {
  document.execCommand('justifyFull', false, undefined)
}

// ─── Indent / outdent ──────────────────────────────────────────────────────

export function indent() {
  document.execCommand('indent', false, undefined)
}

export function outdent() {
  document.execCommand('outdent', false, undefined)
}

// ─── Insert ────────────────────────────────────────────────────────────────

/** Insert a horizontal rule at the cursor position. */
export function horizontalRule() {
  document.execCommand('insertHorizontalRule', false, undefined)
}

// ─── Line spacing ──────────────────────────────────────────────────────────

/** Apply a CSS line-height value to the block element at the cursor. */
export function lineSpacing(value: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  let node: Node | null = range.commonAncestorContainer

  // Walk up to find the nearest block element
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode
  }

  // Apply line-height to all selected block-level elements
  const block = node as HTMLElement | null
  if (block) {
    const editor = block.closest('[contenteditable]') as HTMLElement | null
    if (!editor) return

    // Find all block elements within the selection and apply
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_ELEMENT,
    )

    const blocks: HTMLElement[] = []
    const tags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'])

    // Collect all block-level elements touched by the selection
    let current: Node | null = walker.currentNode
    while (current) {
      if (current instanceof HTMLElement && tags.has(current.tagName)) {
        blocks.push(current)
      }
      current = walker.nextNode()
    }

    if (blocks.length === 0 && block instanceof HTMLElement && tags.has(block.tagName)) {
      blocks.push(block)
    }

    blocks.forEach(el => {
      el.style.lineHeight = value
    })
  }
}

// ─── History ───────────────────────────────────────────────────────────────

export function undo() {
  document.execCommand('undo', false, undefined)
}

export function redo() {
  document.execCommand('redo', false, undefined)
}
