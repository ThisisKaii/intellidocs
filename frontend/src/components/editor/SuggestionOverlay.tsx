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
      if (text.trim()) {
        issues.forEach((issue) => {
          let index = text.indexOf(issue.original)
          while (index !== -1) {
            // Make sure it's a word boundary match if it's spelling, but for grammar it might be multi-word.
            // For simplicity, we just check exact substring match.
            // Better: use Range to get bounding box
            const range = document.createRange()
            try {
              range.setStart(textNode, index)
              range.setEnd(textNode, index + issue.original.length)
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
                endOffset: index + issue.original.length,
              })
            } catch (e) {
              // Ignore range errors
            }
            index = text.indexOf(issue.original, index + 1)
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
    <div className="absolute inset-0 pointer-events-none z-10">
      {rects.map((rect) => (
        <div
          key={rect.id}
          className={`absolute cursor-pointer pointer-events-auto border-b-2 border-dashed ${
            rect.issue.type === 'grammar'
              ? 'border-orange-500/70 hover:bg-orange-500/10'
              : 'border-red-500/70 hover:bg-red-500/10'
          } transition-colors`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
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
            className="absolute z-50 pointer-events-auto bg-card border border-border/80 rounded-xl p-4 w-80 shadow-xs"
            style={{
              top: activeRect.top + activeRect.height + 8,
              left: Math.max(0, activeRect.left - 40),
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <span className={`text-[10px] font-inter font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                activeRect.issue.type === 'grammar'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}>
                {activeRect.issue.type}
              </span>
              <button
                onClick={() => setActiveRect(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="bg-secondary/20 rounded-lg p-3 mb-3 border border-border/40">
              <p className="font-inter text-[13px] line-through text-muted-foreground mb-1.5 opacity-80 decoration-muted-foreground/50">
                {activeRect.issue.original}
              </p>
              <p className="font-inter text-sm font-medium text-foreground flex items-center gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">→</span>
                {activeRect.issue.suggestion}
              </p>
            </div>

            <p className="font-inter text-xs text-muted-foreground/90 mb-4 leading-relaxed">
              {activeRect.issue.explanation}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  onApply(activeRect.issue)
                  setActiveRect(null)
                }}
                className="flex-1 text-[13px] font-inter font-medium py-2 rounded-lg bg-primary text-primary-foreground hover:brightness-110 transition-all border-0 shadow-none"
              >
                Accept
              </button>
              <button
                onClick={() => {
                  onDismiss(activeRect.issue)
                  setActiveRect(null)
                }}
                className="flex-[0.5] text-[13px] font-inter font-medium py-2 rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all border border-border/50 bg-transparent"
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