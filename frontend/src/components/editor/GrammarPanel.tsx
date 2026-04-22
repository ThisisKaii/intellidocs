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
    <div style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: '0.375rem', overflow: 'hidden' }}>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault()
          setExpanded((value) => !value)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
          fontFamily: 'inherit',
          transition: 'background-color 150ms',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
          <AlertCircle style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)', opacity: 0.6, flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.02em', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Grammar & Spell Check
          </span>
          {issues ? (
            <span
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                padding: '0.125rem 0.5rem',
                borderRadius: '0.25rem',
                flexShrink: 0,
                backgroundColor: issues.issues.length === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 91, 79, 0.1)',
                color: issues.issues.length === 0 ? '#10b981' : '#ff5b4f'
              }}
            >
              {issues.issues.length === 0
                ? 'CLEAN'
                : `${issues.issues.length} ISSUE${issues.issues.length !== 1 ? 'S' : ''}`}
            </span>
          ) : null}
        </div>
        {expanded ? (
          <ChevronUp style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} />
        ) : (
          <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} />
        )}
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  runCheck()
                }}
                disabled={loading || plainText.length < 5}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  padding: '0.625rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: loading || plainText.length < 5 ? 'not-allowed' : 'pointer',
                  opacity: loading || plainText.length < 5 ? 0.5 : 1,
                  transition: 'opacity 150ms, box-shadow 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!loading && plainText.length >= 5) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && plainText.length >= 5) {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1'
                  }
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 2px var(--ring)'
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>Check document</>
                )}
              </button>

              {issues ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontStyle: 'italic', margin: 0 }}>
                    {issues.overall}
                  </p>

                  {issues.issues.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                      <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '0.875rem' }}>No issues found</span>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6', borderRadius: '0.375rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                        <AlertCircle style={{ width: '16px', height: '16px' }} />
                        <span>{issues.issues.length} {issues.issues.length === 1 ? 'Issue' : 'Issues'} Highlighted</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', opacity: 0.9, margin: 0 }}>
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