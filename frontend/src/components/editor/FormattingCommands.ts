
function getCurrentBlockTag(): string {
  const value = document.queryCommandValue('formatBlock')
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function normalizeBlock() {
  if (document.queryCommandState('insertUnorderedList')) {
    document.execCommand('insertUnorderedList', false, undefined)
  }

  if (document.queryCommandState('insertOrderedList')) {
    document.execCommand('insertOrderedList', false, undefined)
  }


  document.execCommand('formatBlock', false, '<p>')
}

export function bold() {
  document.execCommand('bold', false, undefined)
}

export function italic() {
  document.execCommand('italic', false, undefined)
}

export function underline() {
  document.execCommand('underline', false, undefined)
}

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

export function blockquote() {
  const current = getCurrentBlockTag()
  if (current === 'blockquote') {

    document.execCommand('formatBlock', false, '<p>')
    return
  }
  normalizeBlock()
  document.execCommand('formatBlock', false, '<blockquote>')
}

export function strikethrough() { 
  document.execCommand('strikeThrough', false, undefined)
}

export function fontsize(size: string) { 
  document.execCommand('fontSize', false, size)
}

export function fontcolor(color: string) { 
  document.execCommand('foreColor', false, color)
}

export function superscript() {
  document.execCommand('superscript', false, undefined)
}

export function subscript() {
  document.execCommand('subscript', false, undefined)
}

export function indent() {
  document.execCommand('indent', false, undefined)
}

export function outdent() {
  document.execCommand('outdent', false, undefined)
}

export function undo() {
  document.execCommand('undo', false, undefined)
}

export function redo() {
  document.execCommand('redo', false, undefined)
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

export function clearFormatting() {
  document.execCommand('removeFormat', false, undefined)
  normalizeBlock()
}


