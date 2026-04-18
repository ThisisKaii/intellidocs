import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

interface GrammarIssue {
  type: string
  original: string
  suggestion: string
  explanation: string
}

interface GrammarResult {
  issues: GrammarIssue[]
  overall: string
}

interface GrammarPanelProps {
  text: string
  onCheckComplete?: (issues: GrammarIssue[]) => void
}

/** Collapsible Grammar & Spell Check panel. */
export default function GrammarPanel({ text, onCheckComplete }: GrammarPanelProps): JSX.Element {
  const [issues, setIssues] = useState<GrammarResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [expanded, setExpanded] = useState<boolean>(true)

  /** Run grammar check against the document text. */
  async function runCheck(): Promise<void> {
    if (!text || text.length < 10) return
    setLoading(true)
    setIssues(null)

    // TODO: Wire to pythonBridge.ts grammar checker
    // For now, simulate a short delay and return clean
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const result: GrammarResult = { issues: [], overall: 'No issues found.' }

    setIssues(result)
    setLoading(false)
    onCheckComplete?.(result.issues)
  }

  return (
    <div className="bg-transparent border border-border/50 rounded-md overflow-hidden">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setExpanded((v) => !v) }}
        className="w-full flex items-center justify-between px-4 py-3 bg-transparent text-foreground hover:bg-secondary/30 transition-colors border-0 shadow-none outline-none focus:outline-none"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <AlertCircle className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <span className="font-inter text-sm font-semibold tracking-tight text-left truncate">Grammar & Spell Check</span>
          {issues && (
            <span className={`text-[10px] font-inter font-bold px-2 py-0.5 rounded shrink-0 ${
              issues.issues.length === 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 text-destructive dark:text-red-400'
            }`}>
              {issues.issues.length === 0 ? 'CLEAN' : `${issues.issues.length} ISSUE${issues.issues.length !== 1 ? 'S' : ''}`}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border/50 pt-3">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); runCheck() }}
                disabled={loading || !text}
                className="w-full flex items-center justify-center gap-2 bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs font-inter font-semibold px-4 py-2.5 rounded disabled:opacity-50 text-muted-foreground/80 border-0 shadow-none"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                ) : (
                  <>Check document</>
                )}
              </button>

              {issues && (
                <div className="mt-3 space-y-2">
                  {issues.overall && (
                    <p className="font-inter text-xs text-muted-foreground italic">{issues.overall}</p>
                  )}
                  {issues.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-inter text-sm">No issues found</span>
                    </div>
                  ) : (
                    issues.issues.map((issue, i) => (
                      <div key={i} className="bg-destructive/5 border border-destructive/15 rounded-md p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className={`font-inter text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            issue.type === 'grammar'
                              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}>
                            {issue.type}
                          </span>
                        </div>
                        <p className="font-inter text-xs">
                          <span className="line-through text-muted-foreground">{issue.original}</span>
                          {' → '}
                          <span className="font-medium text-foreground">{issue.suggestion}</span>
                        </p>
                        {issue.explanation && (
                          <p className="font-inter text-xs text-muted-foreground mt-1">{issue.explanation}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
