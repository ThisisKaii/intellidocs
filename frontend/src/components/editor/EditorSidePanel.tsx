import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  ChevronRight,
  Check,
  X,
  Sparkles,
  CornerDownLeft,
  SpellCheck2,
} from 'lucide-react'
import AIChatbot from './AIChatbot'
import { FORMAT_LABELS } from './SuggestionPanel'
import type { ScannerSuggestion } from '@/hooks/useAutoFormatScanner'
import type { GrammarIssue } from './GrammarPanel'
import type { Suggestion } from './SuggestionPanel'

export type SidePanelTab = 'assistant' | 'suggestions'

interface EditorSidePanelProps {
  open: boolean
  activeTab: SidePanelTab
  onToggle: () => void
  onTabChange: (tab: SidePanelTab) => void
  editor: Editor | null
  documentId: string | undefined
  documentTitle?: string
  documentContent: string
  scannerSuggestions: ScannerSuggestion[]
  /** Key of the suggestion currently highlighted in the editor (drives the active card state). */
  activeScannerKey?: string | null
  mlSuggestions: Suggestion[]
  grammarIssues: GrammarIssue[]
  onJumpTo: (suggestion: ScannerSuggestion) => void
  onAcceptScanner: (key: string) => void
  onRejectScanner: (key: string) => void
  onApplyMl: (format: string) => void
  onDismissMl: () => void
  onApplyGrammar: (issue: GrammarIssue) => void
  onDismissGrammar: (issue: GrammarIssue) => void
  onFocusEditor?: () => void
  /** When true, only the AI Assistant tab is shown (share-link / trash views). */
  readOnly?: boolean
  /** Extra tool sections rendered at the bottom of the Suggestions tab. */
  extraSections?: ReactNode
}

/** Collapsible docked side panel hosting the AI assistant and the suggestion queue. */
export default function EditorSidePanel({
  open,
  activeTab,
  onToggle,
  onTabChange,
  editor,
  documentId,
  documentTitle,
  documentContent,
  scannerSuggestions,
  activeScannerKey = null,
  mlSuggestions,
  grammarIssues,
  onJumpTo,
  onAcceptScanner,
  onRejectScanner,
  onApplyMl,
  onDismissMl,
  onApplyGrammar,
  onDismissGrammar,
  onFocusEditor,
  readOnly = false,
  extraSections,
}: EditorSidePanelProps): JSX.Element {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 380 : 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{
        flexShrink: 0,
        overflow: 'hidden',
        borderLeft: open ? '1px solid var(--border)' : 'none',
        backgroundColor: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 380 }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.75rem',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--secondary)',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Editor Assistant
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <span
                  style={{
                    fontSize: '0.625rem',
                    color: 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0 0.375rem',
                  }}
                >
                  <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem' }}>Ctrl+\\</kbd>
                </span>
                <button
                  type="button"
                  onClick={onToggle}
                  title="Collapse panel"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight style={{ width: '16px', height: '16px' }} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '0.25rem',
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
              }}
            >
              <TabButton
                active={activeTab === 'assistant'}
                icon={<Bot style={{ width: '14px', height: '14px' }} />}
                label="AI Assistant"
                onClick={() => onTabChange('assistant')}
              />
              {!readOnly && (
                <TabButton
                  active={activeTab === 'suggestions'}
                  icon={<Sparkles style={{ width: '14px', height: '14px' }} />}
                  label={`Suggestions${scannerSuggestions.length + mlSuggestions.length > 0 ? ` (${scannerSuggestions.length + mlSuggestions.length})` : ''}`}
                  onClick={() => onTabChange('suggestions')}
                />
              )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {activeTab === 'assistant' ? (
                <AIChatbot
                  editor={editor}
                  documentId={documentId}
                  documentTitle={documentTitle}
                  documentContent={documentContent}
                  onFocusEditor={onFocusEditor}
                  docked
                />
              ) : (
                !readOnly && (
                  <SuggestionQueue
                    scannerSuggestions={scannerSuggestions}
                    activeScannerKey={activeScannerKey}
                    mlSuggestions={mlSuggestions}
                    grammarIssues={grammarIssues}
                    onJumpTo={onJumpTo}
                    onAcceptScanner={onAcceptScanner}
                    onRejectScanner={onRejectScanner}
                    onApplyMl={onApplyMl}
                    onDismissMl={onDismissMl}
                    onApplyGrammar={onApplyGrammar}
                    onDismissGrammar={onDismissGrammar}
                    extraSections={extraSections}
                  />
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

interface TabButtonProps {
  active: boolean
  icon: JSX.Element
  label: string
  onClick: () => void
}

function TabButton({ active, icon, label, onClick }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '0.5rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        backgroundColor: active ? 'var(--primary)' : 'var(--secondary)',
        color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

interface SuggestionQueueProps {
  scannerSuggestions: ScannerSuggestion[]
  activeScannerKey?: string | null
  mlSuggestions: Suggestion[]
  grammarIssues: GrammarIssue[]
  onJumpTo: (suggestion: ScannerSuggestion) => void
  onAcceptScanner: (key: string) => void
  onRejectScanner: (key: string) => void
  onApplyMl: (format: string) => void
  onDismissMl: () => void
  onApplyGrammar: (issue: GrammarIssue) => void
  onDismissGrammar: (issue: GrammarIssue) => void
  extraSections?: ReactNode
}

function SuggestionQueue({
  scannerSuggestions,
  activeScannerKey = null,
  mlSuggestions,
  grammarIssues,
  onJumpTo,
  onAcceptScanner,
  onRejectScanner,
  onApplyMl,
  onDismissMl,
  onApplyGrammar,
  onDismissGrammar,
  extraSections,
}: SuggestionQueueProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
      {/* In-canvas formatting suggestions */}
      <section>
        <SectionLabel>Detected formatting needs</SectionLabel>
        {scannerSuggestions.length === 0 ? (
          <EmptyNote>No formatting suggestions right now — keep typing and they will appear here.</EmptyNote>
        ) : scannerSuggestions.map((s) => {
          const isActive = activeScannerKey === s.key
            return (
            <div
              key={s.key}
              style={{
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: isActive ? '2px solid #6366f1' : '1px solid rgba(99, 102, 241, 0.2)',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.05)',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {FORMAT_LABELS[s.format] ?? s.format}
                  {isActive ? (
                    <span
                      style={{
                        fontSize: '0.5625rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                        borderRadius: '0.25rem',
                        padding: '0.125rem 0.375rem',
                      }}
                    >
                      Now showing
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: '0.25rem',
                    padding: '0.125rem 0.375rem',
                  }}
                >
                  {Math.round(s.confidence)}% · p.{s.pageNumber}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                “{s.preview}”
              </p>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <QueueButton onClick={() => onJumpTo(s)} kind="neutral">
                  <CornerDownLeft style={{ width: '12px', height: '12px' }} />
                  Jump
                </QueueButton>
                <QueueButton onClick={() => onAcceptScanner(s.key)} kind="primary">
                  <Check style={{ width: '12px', height: '12px' }} />
                  Apply
                </QueueButton>
                <QueueButton onClick={() => onRejectScanner(s.key)} kind="neutral">
                  <X style={{ width: '12px', height: '12px' }} />
                  Reject
                </QueueButton>
</div>
            </div>
            )
          })}
      </section>

      {/* ML predictions */}
      {mlSuggestions.length > 0 && (
        <section>
          <SectionLabel>ML predictions</SectionLabel>
          {mlSuggestions.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--border)', marginBottom: '0.375rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                  {FORMAT_LABELS[s.format] ?? s.format}
                </p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.reason}
                </p>
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#7928ca', width: '44px', textAlign: 'right' }}>
                {s.confidence}%
              </span>
              <button
                type="button"
                onClick={() => onApplyMl(s.format)}
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--foreground)',
                  color: 'var(--background)',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Apply
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onDismissMl}
            style={{
              width: '100%',
              fontSize: '0.6875rem',
              color: 'var(--muted-foreground)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '0.25rem',
            }}
          >
            Dismiss ML predictions
          </button>
        </section>
      )}

      {/* Grammar issues */}
      <section>
        <SectionLabel>
          <SpellCheck2Glyph /> Grammar &amp; spelling ({grammarIssues.length})
        </SectionLabel>
        {grammarIssues.length === 0 ? (
          <EmptyNote>No detected issues in the current document text.</EmptyNote>
        ) : (
          grammarIssues.map((issue, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.625rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                marginBottom: '0.375rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                  <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>{issue.original}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}> → </span>
                  <span style={{ color: '#10b981' }}>{issue.suggestion}</span>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onDismissGrammar(issue)}
                  title="Ignore"
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--muted-foreground)',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Ignore
                </button>
                <button
                  type="button"
                  onClick={() => onApplyGrammar(issue)}
                  disabled={issue.actionable === false}
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    border: 'none',
                    cursor: issue.actionable === false ? 'not-allowed' : 'pointer',
                    opacity: issue.actionable === false ? 0.5 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  Fix
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Existing tool sections (formatting rules, session stats, MCP panel) */}
      {extraSections && <div>{extraSections}</div>}
    </div>
  )
}

function SpellCheck2Glyph(): JSX.Element {
  return <SpellCheck2 style={{ width: '12px', height: '12px', verticalAlign: '-1px' }} />
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted-foreground)',
        marginBottom: '0.5rem',
      }}
    >
      {children}
    </div>
  )
}

function EmptyNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0, fontStyle: 'italic' }}>
      {children}
    </p>
  )
}

interface QueueButtonProps {
  children: ReactNode
  onClick: () => void
  kind: 'primary' | 'neutral'
}

function QueueButton({ children, onClick, kind }: QueueButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.6875rem',
        fontWeight: 600,
        padding: '0.25rem 0.5rem',
        borderRadius: '0.375rem',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        backgroundColor: kind === 'primary' ? 'var(--foreground)' : 'var(--secondary)',
        color: kind === 'primary' ? 'var(--background)' : 'var(--foreground)',
      }}
    >
      {children}
    </button>
  )
}