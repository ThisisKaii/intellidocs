

import { useRef, useEffect, forwardRef } from 'react'
import { saveSelectionIfInside } from './SelectionManager'

interface EditorCoreProps {
  onContentChange?: (content: string) => void
  initialContent?: string
  className?: string
}

// Editor core component using forwardRef so parent can focus editor
export const EditorCore = forwardRef<HTMLDivElement, EditorCoreProps>(
  ({ onContentChange, initialContent = '', className = '' }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)

    // Sync external ref with internal ref
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(editorRef.current)
      } else if (ref) {
        ref.current = editorRef.current
      }
    }, [ref])

    // Load initial content once
    useEffect(() => {

      if(!editorRef.current) return
      if (editorRef.current.innerHTML !== initialContent) {
      editorRef.current.innerHTML = initialContent
    }
    }, [initialContent])

    // Track selection changes globally
    useEffect(() => {
      const handleSelectionChange = () => {
        saveSelectionIfInside(editorRef.current)
      }
      document.addEventListener('selectionchange', handleSelectionChange)
      return () => document.removeEventListener('selectionchange', handleSelectionChange)
    }, [])

    // Handle typing input
    function handleInput() {
      if (editorRef.current && onContentChange) {
        onContentChange(editorRef.current.innerHTML)
      }
    }

    // Handle key events (tab + backspace behavior)
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
      if (event.key === 'Tab') {
        event.preventDefault()
        document.execCommand('insertHTML', false, '&#9;')
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
        }
      }
    }

    // Paste as plain text
    function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
    }

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`intellidocs-editor min-h-[60vh] border-0 bg-transparent px-0 py-0 shadow-none focus:outline-none focus:ring-0 ${className}`}
        style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}
      />
    )
  }
)

EditorCore.displayName = 'EditorCore'
