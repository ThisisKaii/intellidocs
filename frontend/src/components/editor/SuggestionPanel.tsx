import { motion, AnimatePresence } from 'framer-motion'
import { Brain, X } from 'lucide-react'

/** Format labels for display. */
const FORMAT_LABELS: Record<string, string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  blockquote: 'Blockquote',
  unordered_list: 'Bullet List',
  ordered_list: 'Numbered List',
  ul: 'Bullet List',
  ol: 'Numbered List',
  code_block: 'Code Block',
}

export interface Suggestion {
  format: string
  confidence: number
  reason: string
}

interface SuggestionPanelProps {
  suggestions: Suggestion[]
  onApply: (format: string) => void
  onDismiss: () => void
}

/** ML Predictions card shown in the right panel. */
export default function SuggestionPanel({ suggestions, onApply, onDismiss }: SuggestionPanelProps): JSX.Element | null {
  if (!suggestions || suggestions.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="bg-transparent border border-border rounded-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-muted-foreground/60" />
            <span className="font-inter text-[11px] font-bold tracking-wider text-muted-foreground/80">
              ML PREDICTIONS
            </span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onDismiss() }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Suggestions list */}
        <div className="p-2 space-y-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onApply(s.format)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary transition-colors text-left group"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center">
                <span className="font-inter text-[10px] font-bold text-accent">{s.confidence}%</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-inter text-sm font-medium text-foreground">
                  {FORMAT_LABELS[s.format] || s.format}
                </p>
                <p className="font-inter text-xs text-muted-foreground truncate">{s.reason}</p>
              </div>

              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${s.confidence}%` }}
                />
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-border">
          <p className="font-inter text-xs text-muted-foreground italic">
            Learned from your formatting history
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export { FORMAT_LABELS }
