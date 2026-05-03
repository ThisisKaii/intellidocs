import { useEffect, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

import { type GrammarIssue } from './GrammarPanel'

export type { GrammarIssue }

interface SuggestionOverlayProps {
  editorRef: RefObject<HTMLDivElement>
  issues: GrammarIssue[]
  content: string // To trigger re-calc on change
  onApply: (issue: GrammarIssue) => void
  onDismiss: (issue: GrammarIssue) => void
}

interface HighlightRect {
  id: string
  issue: GrammarIssue
  top: number
  left: number
  width: number
  height: number
  node: Text
  startOffset: number
  endOffset: number
}

export default function SuggestionOverlay({
  editorRef,
  issues,
  content,
  onApply,
  onDismiss,
}: SuggestionOverlayProps) {
  const [rects, setRects] = useState<HighlightRect[]>([])
  const [activeRect, setActiveRect] = useState<HighlightRect | null>(null)

  // Recalculate rects whenever issues or content changes
  useEffect(() => {
    if (!editorRef.current || issues.length === 0) {
      setRects([])
      setActiveRect(null)
      return
    }

    const newRects: HighlightRect[] = []
    const editor = editorRef.current

    // Walk all text nodes
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null)
    let node = walker.nextNode()

    while (node) {
      const textNode = node as Text
      const text = textNode.nodeValue || ''
      const lowerText = text.toLowerCase()

      if (text.trim()) {
        issues.forEach((issue) => {
          const original = issue.original.trim()

          if (!original || original.length < 2) {
            return
          }

          const lowerOriginal = original.toLowerCase()
          let index = lowerText.indexOf(lowerOriginal)

          while (index !== -1) {
            // Match case-insensitively so grammar issues like "this are"
            // still highlight document text like "This are".
            const range = document.createRange()
            try {
              range.setStart(textNode, index)
              range.setEnd(textNode, index + original.length)
              const rect = range.getBoundingClientRect()
              const editorRect = editor.getBoundingClientRect()

              newRects.push({
                id: `${issue.original}-${index}-${Math.random()}`,
                issue,
                top: rect.top - editorRect.top + editor.scrollTop,
                left: rect.left - editorRect.left + editor.scrollLeft,
                width: rect.width,
                height: rect.height,
                node: textNode,
                startOffset: index,
                endOffset: index + original.length,
              })
            } catch (e) {
              // Ignore range errors
            }
            index = lowerText.indexOf(lowerOriginal, index + 1)
          }
        })
      }
      node = walker.nextNode()
    }

    setRects(newRects)
    
    // Hide active rect if its position changed or it's gone
    if (activeRect) {
      const stillExists = newRects.find(r => r.id === activeRect.id)
      if (!stillExists) setActiveRect(null)
    }

  }, [issues, content, editorRef])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {rects.map((rect) => (
        <div
          key={rect.id}
          style={{
            position: 'absolute',
            cursor: 'pointer',
            pointerEvents: 'auto',
            borderBottom: rect.issue.type === 'grammar' ? '2px dashed rgba(249, 115, 22, 0.7)' : '2px dashed rgba(239, 68, 68, 0.7)',
            transition: 'background-color 150ms',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = rect.issue.type === 'grammar' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(239, 68, 68, 0.1)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
          }}
          onClick={() => setActiveRect(activeRect?.id === rect.id ? null : rect)}
        />
      ))}

      <AnimatePresence>
        {activeRect && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              zIndex: 50,
              pointerEvents: 'auto',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
              borderRadius: '0.5rem',
              padding: '1rem',
              width: '320px',
              top: activeRect.top + activeRect.height + 8,
              left: Math.max(0, activeRect.left - 40),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{
                 fontSize: '0.625rem',
                 fontWeight: 700,
                 textTransform: 'uppercase',
                 letterSpacing: '0.05em',
                 padding: '0.125rem 0.5rem',
                 borderRadius: '0.25rem',
                 backgroundColor: activeRect.issue.type === 'grammar' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                 color: activeRect.issue.type === 'grammar' ? '#ea580c' : '#dc2626'
              }}>
                {activeRect.issue.type}
              </span>
              <button
                onClick={() => setActiveRect(null)}
                style={{
                  color: 'var(--muted-foreground)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)' }}
              >
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
            
            <div style={{ backgroundColor: 'var(--secondary)', borderRadius: '0.375rem', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '0.8125rem', textDecoration: 'line-through', color: 'var(--muted-foreground)', marginBottom: '0.375rem', opacity: 0.8, textDecorationColor: 'rgba(115, 115, 115, 0.5)' }}>
                {activeRect.issue.original}
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <span style={{ color: '#10b981' }}>→</span>
                {activeRect.issue.suggestion}
              </p>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '1rem', lineHeight: 1.5 }}>
              {activeRect.issue.explanation}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  if (activeRect.issue.actionable === false) {
                    return
                  }

                  onApply(activeRect.issue)
                  setActiveRect(null)
                }}
                disabled={activeRect.issue.actionable === false}
                style={{
                  flex: 1,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 0',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  border: 'none',
                  cursor: activeRect.issue.actionable === false ? 'not-allowed' : 'pointer',
                  opacity: activeRect.issue.actionable === false ? 0.5 : 1,
                  fontFamily: 'inherit',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => {
                  if (activeRect.issue.actionable !== false) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeRect.issue.actionable !== false) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1'
                  }
                }}
              >
                {activeRect.issue.actionable === false ? 'Review manually' : 'Accept'}
              </button>
              <button
                onClick={() => {
                  onDismiss(activeRect.issue)
                  setActiveRect(null)
                }}
                style={{
                  flex: 0.5,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 0',
                  borderRadius: '0.375rem',
                  color: 'var(--muted-foreground)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background-color 150ms, color 150ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
                }}
              >
                Ignore
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}