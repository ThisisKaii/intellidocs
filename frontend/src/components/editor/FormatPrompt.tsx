import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Check, X } from 'lucide-react'
import { FORMAT_LABELS } from './SuggestionPanel'

export interface FormatSuggestion {
  format: string
  confidence: number
}

interface FormatPromptProps {
  suggestion: FormatSuggestion | null
  onAccept: (format: string) => void
  onReject: () => void
}

/**
 * Floating YES/NO prompt that appears when the ML predictor is confident
 * enough to suggest a format. Positioned near the bottom of the editor.
 */
export default function FormatPrompt({ suggestion, onAccept, onReject }: FormatPromptProps): JSX.Element {
  return (
    <AnimatePresence>
      {suggestion && (
        <motion.div
          key={suggestion.format}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 bg-card border border-accent/30 shadow-lg rounded-xl px-4 py-3"
          style={{ pointerEvents: 'all' }}
        >
          {/* Scanning pulse dot */}
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent animate-ping opacity-60" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent" />
          </div>

          {/* Label */}
          <div className="flex-1">
            <p className="font-inter text-xs text-muted-foreground leading-none mb-0.5">Apply format?</p>
            <p className="font-fraunces text-sm font-medium text-foreground">
              {FORMAT_LABELS[suggestion.format] || suggestion.format}
            </p>
          </div>

          {/* Confidence */}
          <span className="font-inter text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
            {suggestion.confidence}%
          </span>

          {/* YES */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onAccept(suggestion.format) }}
            className="flex items-center gap-1.5 bg-accent text-accent-foreground text-xs font-inter font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Check className="w-3 h-3" /> Yes
          </button>

          {/* NO */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onReject() }}
            className="flex items-center gap-1.5 border border-border text-muted-foreground text-xs font-inter font-medium px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-3 h-3" /> No
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}