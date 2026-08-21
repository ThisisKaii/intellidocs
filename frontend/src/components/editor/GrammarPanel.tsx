import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { api } from '@/services/api'

export interface GrammarIssue {
  type: string
  original: string
  suggestion: string
  explanation: string
  actionable?: boolean
}

interface GrammarResult {
  issues: GrammarIssue[]
  overall: string
}

interface GrammarPanelProps {
  text: string
  activeIssues?: GrammarIssue[]
  onCheckComplete?: (issues: GrammarIssue[]) => void
  onApply?: (issue: GrammarIssue) => void
  onDismiss?: (issue: GrammarIssue) => void
  autoCheck?: boolean
  autoCheckDelayMs?: number
  autoCheckCooldownMs?: number
  showPanel?: boolean
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
    actionable: true,
  }))

  const spellingIssues: GrammarIssue[] = spelling.issues.map((issue) => ({
    type: issue.suggestion ? issue.type : 'spelling-review',
    original: issue.word,
    suggestion: issue.suggestion ?? 'Review spelling manually',
    explanation: issue.suggestion
      ? 'Possible spelling issue detected by the spell checker.'
      : 'Possible non-word detected, but no safe automatic replacement was found.',
    actionable: Boolean(issue.suggestion),
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
  activeIssues,
  onCheckComplete,
  onApply,
  onDismiss,
  autoCheck = false,
  autoCheckDelayMs = 2500,
  autoCheckCooldownMs = 12000,
  showPanel = true,
}: GrammarPanelProps): JSX.Element | null {
  const [issues, setIssues] = useState<GrammarResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [expanded, setExpanded] = useState<boolean>(true)
  const autoCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAutoCheckAtRef = useRef<number>(0)
  const lastCheckedTextRef = useRef<string>('')

  // Strip HTML tags so the panel works whether it receives plain text or raw HTML
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  // The prediction API rejects payloads over 50k chars — check the head only.
  const checkText = plainText.slice(0, 50000)
  const displayedIssues = activeIssues ?? issues?.issues ?? []
  const overallMessage =
    issues && activeIssues !== undefined && activeIssues.length === 0
      ? 'All visible issues have been resolved.'
      : issues?.overall

  /** Run grammar and spelling checks against the current text. */
  async function runCheck(): Promise<void> {
    if (plainText.length < 5) {
      return
    }

    setLoading(true)
    setIssues(null)

    try {
      const [grammarResult, spellingResult] = await Promise.all([
        api.predictions.grammarCheck(checkText),
        api.predictions.spellCheck(checkText),
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

  /** Auto-run grammar/spell checks after typing pauses. */
  useEffect(() => {
    if (!autoCheck) {
      return
    }

    if (loading) {
      return
    }

    if (plainText.length < 5) {
      return
    }

    if (plainText === lastCheckedTextRef.current) {
      return
    }

    if (autoCheckTimerRef.current) {
      clearTimeout(autoCheckTimerRef.current)
    }

    autoCheckTimerRef.current = setTimeout(() => {
      const now = Date.now()
      if (now - lastAutoCheckAtRef.current < autoCheckCooldownMs) {
        return
      }

      lastAutoCheckAtRef.current = now
      lastCheckedTextRef.current = plainText
      void runCheck()
    }, autoCheckDelayMs)

    return () => {
      if (autoCheckTimerRef.current) {
        clearTimeout(autoCheckTimerRef.current)
      }
    }
  }, [autoCheck, autoCheckDelayMs, autoCheckCooldownMs, loading, plainText])

  if (!showPanel) {
    return null
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
                backgroundColor: displayedIssues.length === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 91, 79, 0.1)',
                color: displayedIssues.length === 0 ? '#10b981' : '#ff5b4f'
              }}
            >
              {displayedIssues.length === 0
                ? 'CLEAN'
                : `${displayedIssues.length} ISSUE${displayedIssues.length !== 1 ? 'S' : ''}`}
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
              {issues ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontStyle: 'italic', margin: 0 }}>
                    {overallMessage}
                  </p>

                  {displayedIssues.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                      <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '0.875rem' }}>No issues found</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {displayedIssues.map((issue, index) => (
                        <div
                          key={`${issue.original}-${index}`}
                          style={{
                            borderRadius: '0.375rem',
                            border: '1px solid var(--border)',
                            padding: '0.625rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                            <span
                              style={{
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                padding: '0.125rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                                color: '#ea580c',
                              }}
                            >
                              {issue.type}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 0.375rem', lineHeight: 1.4 }}>
                            <span style={{ textDecoration: 'line-through', opacity: 0.8 }}>{issue.original}</span>
                            {' → '}
                            <span style={{ color: '#10b981' }}>{issue.suggestion}</span>
                          </p>
                          <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                            {issue.explanation}
                          </p>
                          <div style={{ display: 'flex', gap: '0.375rem' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (issue.actionable !== false) onApply?.(issue)
                              }}
                              disabled={issue.actionable === false}
                              style={{
                                flex: 1,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.375rem 0',
                                borderRadius: '0.375rem',
                                border: 'none',
                                backgroundColor: 'var(--primary)',
                                color: 'var(--primary-foreground)',
                                cursor: issue.actionable === false ? 'not-allowed' : 'pointer',
                                opacity: issue.actionable === false ? 0.5 : 1,
                                fontFamily: 'inherit',
                              }}
                            >
                              {issue.actionable === false ? 'Review manually' : 'Apply'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDismiss?.(issue)}
                              style={{
                                flex: 1,
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                padding: '0.375rem 0',
                                borderRadius: '0.375rem',
                                color: 'var(--muted-foreground)',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      ))}
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