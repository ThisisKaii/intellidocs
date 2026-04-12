
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
