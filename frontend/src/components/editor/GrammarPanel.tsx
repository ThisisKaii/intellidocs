import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { api } from '@/services/api'

export interface GrammarIssue {
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

/** Build a user-facing grammar result from grammar and spelling API responses. */
function buildGrammarResult(
  grammar: {
    score: number
    status: string
    message: string
    issues?: {
      type: string
      original: string
      suggestion: string
      explanation: string
    }[]
  },
  spelling: {
    issues: { word: string; suggestion: string | null; type: string }[]
    count: number
    message: string
  }
): GrammarResult {
  const grammarIssues: GrammarIssue[] = (grammar.issues ?? []).map((issue) => ({
    type: issue.type,
    original: issue.original,
    suggestion: issue.suggestion,
    explanation: issue.explanation,
  }))

  const spellingIssues: GrammarIssue[] = spelling.issues.map((issue) => ({
    type: issue.type,
    original: issue.word,
    suggestion: issue.suggestion ?? issue.word,
    explanation: 'Possible spelling issue detected by the spell checker.',
  }))

  const issues = [...grammarIssues, ...spellingIssues]

  const overall =
    issues.length > 0
      ? `${grammar.message} ${spelling.message}`
      : grammar.message

  return {
    issues,
    overall,
  }
}

/** Collapsible Grammar & Spell Check panel wired to backend APIs. */
export default function GrammarPanel({
  text,
  onCheckComplete,
}: GrammarPanelProps): JSX.Element {
  const [issues, setIssues] = useState<GrammarResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [expanded, setExpanded] = useState<boolean>(true)

  // Strip HTML tags so the panel works whether it receives plain text or raw HTML
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  /** Run grammar and spelling checks against the current text. */
  async function runCheck(): Promise<void> {
    if (plainText.length < 5) {
      return
    }

    setLoading(true)
    setIssues(null)

    try {
      const [grammarResult, spellingResult] = await Promise.all([
        api.predictions.grammarCheck(plainText),
        api.predictions.spellCheck(plainText),
      ])

      const result = buildGrammarResult(grammarResult, spellingResult)
      setIssues(result)
      onCheckComplete?.(result.issues)
    } catch (error) {
      const result: GrammarResult = {
        issues: [],
        overall:
          error instanceof Error ? error.message : 'Grammar check failed.',
      }
      setIssues(result)
      onCheckComplete?.([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-transparent border border-border/50 rounded-md overflow-hidden">
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault()
          setExpanded((value) => !value)
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-transparent text-foreground hover:bg-secondary/30 transition-colors border-0 shadow-none outline-none focus:outline-none"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <AlertCircle className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <span className="font-inter text-sm font-semibold tracking-tight text-left truncate">
            Grammar & Spell Check
          </span>
          {issues ? (
            <span
              className={`text-[10px] font-inter font-bold px-2 py-0.5 rounded shrink-0 ${
                issues.issues.length === 0
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 text-destructive dark:text-red-400'
              }`}
            >
              {issues.issues.length === 0
                ? 'CLEAN'
                : `${issues.issues.length} ISSUE${issues.issues.length !== 1 ? 'S' : ''}`}
            </span>
          ) : null}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border/50 pt-3">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  runCheck()
                }}
                disabled={loading || plainText.length < 5}
                className="w-full flex items-center justify-center gap-2 bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs font-inter font-semibold px-4 py-2.5 rounded disabled:opacity-50 text-muted-foreground/80 border-0 shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>Check document</>
                )}
              </button>

              {issues ? (
                <div className="mt-3 space-y-2">
                  <p className="font-inter text-xs text-muted-foreground italic">
                    {issues.overall}
                  </p>

                  {issues.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-inter text-sm">No issues found</span>
                    </div>
                  ) : (
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-md p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-inter text-sm font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>{issues.issues.length} {issues.issues.length === 1 ? 'Issue' : 'Issues'} Highlighted</span>
                      </div>
                      <p className="font-inter text-xs opacity-90">
                        Review the dashed underlines directly in your document to apply or dismiss suggestions.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}