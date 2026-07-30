import { useRef, useEffect, forwardRef } from 'react'
import { saveSelectionIfInside } from './SelectionManager'

interface EditorCoreProps {
  onContentChange?: (content: string) => void
  initialContent?: string
  className?: string
}

/** Ensure every top-level block in the editor has a unique data-block-id attribute (e.g., "h1-3f9a", "p-7b2e"). */
export function ensureBlockIdentifiers(editor: HTMLElement | null): void {
  if (!editor) return

  const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'])
  const children = Array.from(editor.children)

  for (const child of children) {
    if (child instanceof HTMLElement && blockTags.has(child.tagName)) {
      if (!child.getAttribute('data-block-id')) {
        const tagPrefix = child.tagName.toLowerCase()
        const shortUuid = Math.random().toString(36).substring(2, 8)
        child.setAttribute('data-block-id', `${tagPrefix}-${shortUuid}`)
      }
    }
  }
}

/** Heading and paragraph styles matching the Dean's manuscript specifications. */
const EDITOR_HEADING_STYLES = `
  [contenteditable] h1 {
    font-size: 12pt;
    font-weight: 700;
    margin: 1em 0 0.25em;
    font-family: 'Times New Roman', Times, serif;
  }
  [contenteditable] h2 {
    font-size: 12pt;
    font-weight: 700;
    font-style: italic;
    margin: 1em 0 0.25em;
    font-family: 'Times New Roman', Times, serif;
  }
  [contenteditable] h3,
  [contenteditable] h4,
  [contenteditable] h5,
  [contenteditable] h6 {
    font-size: 11pt;
    font-weight: 700;
    margin: 0.75em 0 0.25em;
    font-family: 'Times New Roman', Times, serif;
  }
  [contenteditable] p,
  [contenteditable] div,
  [contenteditable] li {
    font-size: 11pt;
    font-family: 'Times New Roman', Times, serif;
  }
  [contenteditable] blockquote {
    border-left: 3px solid var(--border);
    margin: 0.75em 0;
    padding-left: 1em;
    color: var(--muted-foreground);
    font-style: italic;
  }
  [contenteditable] hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }
`

// Editor core component using forwardRef so parent can focus the editor.
export const EditorCore = forwardRef<HTMLDivElement, EditorCoreProps>(
  ({ onContentChange, initialContent = '', className = '' }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)

    // Sync external ref with internal ref.
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(editorRef.current)
      } else if (ref) {
        ref.current = editorRef.current
      }
    }, [ref])

    // Load initial content only on first mount or when switching documents.
    const hasLoaded = useRef(false)
    useEffect(() => {
      if (!editorRef.current) return
      if (!hasLoaded.current && initialContent) {
        editorRef.current.innerHTML = initialContent
        ensureBlockIdentifiers(editorRef.current)
        hasLoaded.current = true
      }
    }, [initialContent])

    // Track selection changes globally so the toolbar can show active state.
    useEffect(() => {
      const handleSelectionChange = () => {
        saveSelectionIfInside(editorRef.current)
      }
      document.addEventListener('selectionchange', handleSelectionChange)
      return () => document.removeEventListener('selectionchange', handleSelectionChange)
    }, [])

    // Emit content on every keystroke / mutation.
    function handleInput() {
      if (editorRef.current) {
        ensureBlockIdentifiers(editorRef.current)
        if (onContentChange) {
          onContentChange(editorRef.current.innerHTML)
        }
      }
    }

    // Handle Tab (indent) and Backspace (outdent at list/blockquote start).
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
      if (event.key === 'Tab') {
        event.preventDefault()
        document.execCommand('insertHTML', false, '&#9;')
        if (editorRef.current) ensureBlockIdentifiers(editorRef.current)
        return
      }

      if (event.key === 'Backspace') {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const range = selection.getRangeAt(0)
        if (!range.collapsed) return

        const startNode = range.startContainer
        const startOffset = range.startOffset
        const element =
          startNode.nodeType === Node.ELEMENT_NODE
            ? (startNode as Element)
            : (startNode.parentElement as Element | null)

        if (!element) return

        const inList = element.closest('li')
        const inBlockquote = element.closest('blockquote')
        const atStart = startOffset === 0

        if (atStart && (inList || inBlockquote)) {
          event.preventDefault()
          document.execCommand('outdent', false, undefined)
          if (editorRef.current) ensureBlockIdentifiers(editorRef.current)
        }
      }
    }

    // Paste as plain text to avoid importing foreign styles.
    function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
      if (editorRef.current) ensureBlockIdentifiers(editorRef.current)
    }

    return (
      <>
        {/* Inject manuscript heading styles once */}
        <style>{EDITOR_HEADING_STYLES}</style>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck="false"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={className}
          style={{
            minHeight: '60vh',
            border: 'none',
            backgroundColor: 'transparent',
            padding: 0,
            boxShadow: 'none',
            outline: 'none',
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            fontSize: '11pt',
            lineHeight: 1.5,
            color: 'var(--foreground)',
            fontFamily: "'Times New Roman', Times, serif",
          }}
        />
      </>
    )
  }
)

EditorCore.displayName = 'EditorCore'
