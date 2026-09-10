import { useState, useEffect, useCallback } from 'react'
import { Editor } from '@tiptap/react'
import { api } from '@/services/api'

interface GhostSuggestion {
  text: string
  format: string
  confidence: number
}

interface GhostFormattingProps {
  editor: Editor | null
  documentId?: string
}

const FORMAT_LABELS: Record<string, string> = {
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  body: 'Body Text',
  unordered_list: 'Bullet List',
  ordered_list: 'Numbered List',
}

/**
 * S7: Ghost Formatting "Tab to Apply" (Copilot Style).
 * Non-intrusive ghosted preview of formatting suggestions while typing.
 * Press Tab to accept, Esc to dismiss.
 */
export default function GhostFormatting({ editor, documentId }: GhostFormattingProps): JSX.Element {
  const [suggestion, setSuggestion] = useState<GhostSuggestion | null>(null)
  const [visible, setVisible] = useState(false)

  const checkFormatting = useCallback(async () => {
    if (!editor || !documentId) return

    const { state } = editor
    const { $from } = state.selection
    const node = $from.node($from.depth)
    if (!node) return

    const text = node.textContent.trim()
    if (!text || text.length < 3) {
      setSuggestion(null)
      setVisible(false)
      return
    }

    // Don't suggest if already at the target format
    const currentFormat = node.type.name
    if (currentFormat !== 'paragraph') return

    try {
      const response = await api.predictions.predict(text, undefined)
      if (
        response.confidence >= 0.85 &&
        response.predicted_format !== 'body' &&
        response.predicted_format !== currentFormat
      ) {
        setSuggestion({
          text,
          format: response.predicted_format,
          confidence: response.confidence,
        })
        setVisible(true)
      } else {
        setSuggestion(null)
        setVisible(false)
      }
    } catch {
      // Silently ignore prediction errors for ghost formatting
    }
  }, [editor, documentId])

  useEffect(() => {
    if (!editor) return

    const handler = () => {
      // Debounce: check after 800ms of inactivity
      const timeout = setTimeout(() => {
        void checkFormatting()
      }, 800)
      return () => clearTimeout(timeout)
    }

    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [editor, checkFormatting])

  // Handle keyboard shortcuts (Tab to apply, Esc to dismiss)
  useEffect(() => {
    if (!editor || !suggestion) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Tab' && visible && suggestion) {
        e.preventDefault()
        applySuggestion()
      } else if (e.key === 'Escape' && visible) {
        e.preventDefault()
        dismissSuggestion()
      }
    }

    // Use capture phase to intercept before TipTap
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  })

  function applySuggestion() {
    if (!editor || !suggestion) return

    const format = suggestion.format
    const chain = editor.chain().focus()

    if (format === 'heading1') chain.setNode('heading', { level: 1 })
    else if (format === 'heading2') chain.setNode('heading', { level: 2 })
    else if (format === 'heading3') chain.setNode('heading', { level: 3 })
    else if (format === 'unordered_list') chain.toggleBulletList()
    else if (format === 'ordered_list') chain.toggleOrderedList()
    else chain.setNode('paragraph')

    chain.run()
    dismissSuggestion()
  }

  function dismissSuggestion() {
    setSuggestion(null)
    setVisible(false)
  }

  if (!visible || !suggestion) return <></>

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-popover border border-border shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <span className="text-xs text-muted-foreground">Suggested:</span>
      <span className="text-xs font-semibold text-primary">
        {FORMAT_LABELS[suggestion.format] || suggestion.format}
      </span>
      <span className="text-[10px] text-muted-foreground">
        ({Math.round(suggestion.confidence * 100)}%)
      </span>
      <div className="flex items-center gap-1.5 ml-2">
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-[10px] font-mono text-muted-foreground">
          Tab
        </kbd>
        <span className="text-[10px] text-muted-foreground">accept</span>
      </div>
      <div className="flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-[10px] font-mono text-muted-foreground">
          Esc
        </kbd>
        <span className="text-[10px] text-muted-foreground">dismiss</span>
      </div>
    </div>
  )
}
