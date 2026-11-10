import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { motion } from 'framer-motion'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Sparkles,
  History,
  Wrench,
  RefreshCw,
  SpellCheck2,
  Wand2,
  HelpCircle,
  GraduationCap,
} from 'lucide-react'
import AIChatbot from './AIChatbot'
import HistoryPanel from './HistoryPanel'
import type { DocumentFeedback, DocumentVersion } from '@/services/api'
import { FeedbackPanel, hasFeedback } from './FeedbackPanel'
import { FORMAT_LABELS, formatLabel } from './SuggestionPanel'
import type { ScannerSuggestion } from '@/hooks/useAutoFormatScanner'
import type { GrammarIssue } from './GrammarPanel'
import type { Suggestion } from './SuggestionPanel'

export type SidePanelTab = 'assistant' | 'suggestions' | 'tools' | 'history' | 'feedback'

type QueueView = 'all' | 'formatting' | 'grammar'

/** The formatting suggestion currently open for review (Document's formatPrompt), shown inside its card. */
export interface ActiveFormattingReview {
  /** The card it belongs to; 'active' for a suggestion with no list card (e.g. "apply to the other headings?"). */
  key: string
  label: string
  reason: string | null
  confidence: number | null
  /** Other blocks the suggestion also fits ("Accept all"). */
  similarCount: number
}

/** Expand / accept / dismiss wiring for the review cards; Document owns the state so document clicks can open a card. */
export interface SuggestionReview {
  expandedKey: string | null
  onExpand: (key: string | null) => void
  activeFormatting: ActiveFormattingReview | null
  onAcceptFormatting: () => void
  onAcceptAllFormatting: () => void
  onDismissFormatting: () => void
  onAcceptGrammar: (issue: GrammarIssue, suggestion: string) => void
  onDismissGrammar: (issue: GrammarIssue) => void
}

/** Card key of a grammar/spelling issue: its place in the list (Document uses the same key to open it). */
export function grammarCardKey(issues: readonly GrammarIssue[], issue: GrammarIssue): string {
  return `g-${issues.indexOf(issue)}`
}

const VIEW_STORAGE_KEY = 'intellidocs.suggestionView'

interface EditorSidePanelProps {
  open: boolean
  activeTab: SidePanelTab
  onToggle: () => void
  onTabChange: (tab: SidePanelTab) => void
  editor: Editor | null
  documentId: string | undefined
  documentTitle?: string
  documentContent: string
  /** The full document HTML for the history comparison (documentContent is a shortened AI summary). */
  currentHtml: string
  scannerSuggestions: ScannerSuggestion[]
  /** Key of the suggestion currently highlighted in the editor (drives the active card state). */
  activeScannerKey?: string | null
  mlSuggestions: Suggestion[]
  grammarIssues: GrammarIssue[]
  grammarLoading: boolean
  grammarError: string | null
  grammarCheckedAt: number | null
  /** Page each grammar issue is on, once the layout is known. */
  grammarPages?: Map<GrammarIssue, number>
  onCheckGrammar: () => void
  /** Jump to a formatting suggestion in the document and open it for review. */
  onOpenScanner: (suggestion: ScannerSuggestion) => void
  onOpenMl: (suggestion: Suggestion) => void
  /** Jump to a grammar/spelling issue in the document. */
  onOpenGrammar: (issue: GrammarIssue) => void
  /** In-panel review: which card is open, and its accept / dismiss actions. */
  review: SuggestionReview
  formattingEnabled: boolean
  grammarEnabled: boolean
  onFormattingEnabledChange: (value: boolean) => void
  onGrammarEnabledChange: (value: boolean) => void
  onFocusEditor?: () => void
  /** When true, only the AI Assistant tab is shown (share-link / trash views). */
  readOnly?: boolean
  /** Formatting rules, citations and other tools shown on the Tools tab. */
  toolsSection?: ReactNode
  /** Called after a version snapshot is restored onto the document. */
  onVersionRestored?: (version: DocumentVersion) => void
  /** Opens the help sheet. */
  onOpenHelp?: () => void
  /** Narrow screens: render as a bottom sheet that never covers the page until opened. */
  compact?: boolean
  /** Switches the document to an academic preset when the assistant's preset preview is applied. */
  onApplyPreset?: (presetKey: string) => void
  /** The professor's grade and comments on this submission; the Feedback tab shows when there are any. */
  feedback?: DocumentFeedback | null
}

/** Read the remembered suggestion view, defaulting to formatting. */
function readStoredView(): QueueView {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'grammar' || stored === 'all' ? stored : 'formatting'
  } catch {
    return 'formatting'
  }
}

/** Collapsible docked side panel hosting the AI assistant, suggestions, tools and history. */
export default function EditorSidePanel({
  open,
  activeTab,
  onToggle,
  onTabChange,
  editor,
  documentId,
  documentTitle,
  documentContent,
  currentHtml,
  scannerSuggestions,
  activeScannerKey = null,
  mlSuggestions,
  grammarIssues,
  grammarLoading,
  grammarError,
  grammarCheckedAt,
  grammarPages,
  onCheckGrammar,
  onOpenScanner,
  onOpenMl,
  onOpenGrammar,
  review,
  formattingEnabled,
  grammarEnabled,
  onFormattingEnabledChange,
  onGrammarEnabledChange,
  onFocusEditor,
  readOnly = false,
  toolsSection,
  onVersionRestored,
  onOpenHelp,
  compact = false,
  onApplyPreset,
  feedback = null,
}: EditorSidePanelProps): JSX.Element {
  const showFeedback = hasFeedback(feedback)
  const suggestionCount = scannerSuggestions.length + mlSuggestions.length

  const asideStyle = compact
    ? {
        position: 'fixed' as const,
        left: 0,
        right: 0,
        bottom: 0,
        height: '70vh',
        zIndex: 60,
        overflow: 'hidden',
        borderTop: '1px solid var(--border)',
        borderRadius: '1rem 1rem 0 0',
        boxShadow: open ? '0 -12px 32px var(--border-shadow)' : 'none',
        backgroundColor: 'var(--card)',
        display: 'flex',
        flexDirection: 'column' as const,
        pointerEvents: open ? ('auto' as const) : ('none' as const),
      }
    : {
        flexShrink: 0,
        overflow: 'hidden',
        borderLeft: open ? '1px solid var(--border)' : 'none',
        backgroundColor: 'var(--card)',
        display: 'flex',
        flexDirection: 'column' as const,
      }

  return (
    <>
    {compact && open && (
      <div
        aria-hidden="true"
        onClick={onToggle}
        style={{ position: 'fixed', inset: 0, zIndex: 59, backgroundColor: 'rgba(0,0,0,0.35)' }}
      />
    )}
    <motion.aside
      initial={false}
      animate={compact ? { y: open ? 0 : '100%' } : { width: open ? 380 : 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={asideStyle}
    >
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: compact ? 0 : 380 }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '48px',
            padding: '0 1rem',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
            Editor assistant
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!compact && (
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--muted-foreground)' }}>
                Ctrl+\
              </kbd>
            )}
            {onOpenHelp && (
              <button type="button" onClick={onOpenHelp} title="Help: commands and shortcuts" aria-label="Help" className="panel-icon-btn">
                <HelpCircle style={{ width: '16px', height: '16px' }} />
              </button>
            )}
            <button
              type="button"
              onClick={onToggle}
              title="Collapse panel"
              aria-label="Collapse panel"
              className="panel-icon-btn"
            >
              <ChevronRight style={{ width: '16px', height: '16px', transform: compact ? 'rotate(90deg)' : undefined }} />
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
            // Tabs share the width evenly; never a horizontal scrollbar on scaled displays.
            overflowX: 'hidden',
          }}
        >
          <TabButton
            active={activeTab === 'assistant'}
            icon={<Bot style={{ width: '14px', height: '14px' }} />}
            label="Assistant"
            onClick={() => onTabChange('assistant')}
          />
          {!readOnly && (
            <TabButton
              active={activeTab === 'suggestions'}
              icon={<Sparkles style={{ width: '14px', height: '14px' }} />}
              label="Suggestions"
              count={suggestionCount + grammarIssues.length}
              onClick={() => onTabChange('suggestions')}
            />
          )}
          {!readOnly && (
            <TabButton
              active={activeTab === 'tools'}
              icon={<Wrench style={{ width: '14px', height: '14px' }} />}
              label="Tools"
              onClick={() => onTabChange('tools')}
            />
          )}
          {!readOnly && (
            <TabButton
              active={activeTab === 'history'}
              icon={<History style={{ width: '14px', height: '14px' }} />}
              label="History"
              onClick={() => onTabChange('history')}
            />
          )}
          {showFeedback && (
            <TabButton
              active={activeTab === 'feedback'}
              icon={<GraduationCap style={{ width: '14px', height: '14px' }} />}
              label="Feedback"
              count={feedback.comments.length + (feedback.review ? 1 : 0)}
              onClick={() => onTabChange('feedback')}
            />
          )}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* Kept mounted at all times (hidden via display) so the
              conversation survives tab switches and panel collapse. */}
          <div style={{ display: activeTab === 'assistant' ? 'block' : 'none', height: '100%' }}>
            <AIChatbot
              editor={editor}
              documentId={documentId}
              documentTitle={documentTitle}
              documentContent={documentContent}
              onFocusEditor={onFocusEditor}
              onApplyPreset={onApplyPreset}
              docked
            />
          </div>
          {activeTab === 'feedback' && showFeedback && <FeedbackPanel feedback={feedback} />}
          {activeTab === 'history' && !readOnly && (
            <HistoryPanel
              documentId={documentId}
              currentHtml={currentHtml}
              onRestored={(version) => onVersionRestored?.(version)}
            />
          )}
          {activeTab === 'tools' && !readOnly && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
              {toolsSection}
            </div>
          )}
          {activeTab === 'suggestions' && !readOnly && (
            <SuggestionQueue
              scannerSuggestions={scannerSuggestions}
              activeScannerKey={activeScannerKey}
              mlSuggestions={mlSuggestions}
              grammarIssues={grammarIssues}
              grammarLoading={grammarLoading}
              grammarError={grammarError}
              grammarCheckedAt={grammarCheckedAt}
              grammarPages={grammarPages}
              formattingEnabled={formattingEnabled}
              grammarEnabled={grammarEnabled}
              onFormattingEnabledChange={onFormattingEnabledChange}
              onGrammarEnabledChange={onGrammarEnabledChange}
              onCheckGrammar={onCheckGrammar}
              onOpenScanner={onOpenScanner}
              onOpenMl={onOpenMl}
              onOpenGrammar={onOpenGrammar}
              review={review}
            />
          )}
        </div>
      </motion.div>
    </motion.aside>
    </>
  )
}

interface TabButtonProps {
  active: boolean
  icon: JSX.Element
  label: string
  count?: number
  onClick: () => void
}

function TabButton({ active, icon, label, count, onClick }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        // Size to content, shrink (with ellipsis) only when the panel is too narrow.
        flex: '1 1 auto',
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        padding: '0.375rem 0.375rem',
        borderRadius: '0.5rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        backgroundColor: active ? 'var(--primary)' : 'var(--secondary)',
        color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
      }}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count ? (
        <span
          style={{
            flexShrink: 0,
            fontSize: '0.625rem',
            fontWeight: 700,
            padding: '0 0.3rem',
            borderRadius: '999px',
            backgroundColor: active ? 'color-mix(in srgb, var(--primary-foreground) 22%, transparent)' : 'var(--border)',
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

interface SuggestionQueueProps {
  scannerSuggestions: ScannerSuggestion[]
  activeScannerKey: string | null
  mlSuggestions: Suggestion[]
  grammarIssues: GrammarIssue[]
  grammarLoading: boolean
  grammarError: string | null
  grammarCheckedAt: number | null
  grammarPages?: Map<GrammarIssue, number>
  formattingEnabled: boolean
  grammarEnabled: boolean
  onFormattingEnabledChange: (value: boolean) => void
  onGrammarEnabledChange: (value: boolean) => void
  onCheckGrammar: () => void
  onOpenScanner: (suggestion: ScannerSuggestion) => void
  onOpenMl: (suggestion: Suggestion) => void
  onOpenGrammar: (issue: GrammarIssue) => void
  review: SuggestionReview
}

/** Suggestions tab: a switch between formatting suggestions and grammar/spelling issues. */
function SuggestionQueue(props: SuggestionQueueProps): JSX.Element {
  const { scannerSuggestions, mlSuggestions, grammarIssues, formattingEnabled, grammarEnabled } = props
  const [view, setView] = useState<QueueView>(readStoredView)

  // A card opened from the document (a click on underlined text) must be visible:
  // leave a view that hides its kind, without changing the remembered choice.
  const expandedKey = props.review.expandedKey
  useEffect(() => {
    if (!expandedKey) return
    const isGrammar = expandedKey.startsWith('g-')
    setView((current) => ((isGrammar && current === 'formatting') || (!isGrammar && current === 'grammar') ? 'all' : current))
  }, [expandedKey])

  /** Switch the view and remember it. */
  function chooseView(next: QueueView): void {
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      /* storage unavailable: the choice just isn't remembered */
    }
  }

  const enabled = view === 'all' ? formattingEnabled || grammarEnabled : view === 'formatting' ? formattingEnabled : grammarEnabled
  const setEnabled = view === 'formatting' ? props.onFormattingEnabledChange : props.onGrammarEnabledChange

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
      {/* Filters stay pinned while the list scrolls under them. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'var(--card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          margin: '-0.75rem -0.75rem 0',
          padding: '0.75rem 0.75rem 0.5rem',
        }}
      >
      <div
        role="tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '0.25rem',
          padding: '0.25rem',
          borderRadius: '0.625rem',
          backgroundColor: 'var(--secondary)',
        }}
      >
        <SegmentButton
          active={view === 'all'}
          icon={<Sparkles style={{ width: '13px', height: '13px' }} />}
          label="All"
          count={(formattingEnabled ? scannerSuggestions.length + mlSuggestions.length : 0) + (grammarEnabled ? grammarIssues.length : 0)}
          onClick={() => chooseView('all')}
        />
        <SegmentButton
          active={view === 'formatting'}
          icon={<Wand2 style={{ width: '13px', height: '13px' }} />}
          label="Formatting"
          count={formattingEnabled ? scannerSuggestions.length + mlSuggestions.length : 0}
          onClick={() => chooseView('formatting')}
        />
        <SegmentButton
          active={view === 'grammar'}
          icon={<SpellCheck2 style={{ width: '13px', height: '13px' }} />}
          label="Grammar"
          count={grammarEnabled ? grammarIssues.length : 0}
          onClick={() => chooseView('grammar')}
        />
      </div>

      {view === 'all' ? (
        <>
          <SwitchRow label="Formatting suggestions" checked={formattingEnabled} onChange={props.onFormattingEnabledChange} />
          <SwitchRow label="Grammar & spelling checks" checked={grammarEnabled} onChange={props.onGrammarEnabledChange} />
        </>
      ) : null}
      <label style={{ display: view === 'all' ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
        {view === 'formatting' ? 'Formatting suggestions' : 'Grammar & spelling checks'}
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          aria-label={view === 'formatting' ? 'Turn formatting suggestions on or off' : 'Turn grammar and spelling checks on or off'}
          style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
        />
      </label>
      </div>
      <p style={{ margin: '-0.375rem 0 0', fontSize: '0.6875rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
        Open an item to review it here — the document jumps to it — then Accept or Dismiss.
      </p>

      {!enabled ? (
        <EmptyState
          title="Turned off"
          body={view === 'formatting' ? 'No formatting suggestions will appear while this is off.' : 'Underlines and the list are hidden while this is off.'}
        />
      ) : view === 'all' ? (
        <AllView {...props} />
      ) : view === 'formatting' ? (
        <FormattingView {...props} />
      ) : (
        <GrammarView {...props} />
      )}
    </div>
  )
}

interface SegmentButtonProps {
  active: boolean
  icon: JSX.Element
  label: string
  count: number
  onClick: () => void
}

function SegmentButton({ active, icon, label, count, onClick }: SegmentButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.5rem',
        borderRadius: '0.5rem',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: active ? 'var(--card)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        boxShadow: active ? '0 1px 2px var(--border-shadow)' : 'none',
      }}
    >
      {icon}
      {label}
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: active ? 'var(--primary)' : 'var(--muted-foreground)' }}>
        {count}
      </span>
    </button>
  )
}

/** A labelled on/off switch. */
function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
      {label}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={`Turn ${label.toLowerCase()} on or off`}
        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
      />
    </label>
  )
}

interface AllItem {
  key: string
  page: number | null
  category: string
  onOpen: () => void
  summary: ReactNode
  details: ReactNode
}

/** Open (or close) a card: opening also jumps to the text and loads the suggestion. */
function toggleCard(review: SuggestionReview, key: string, open: () => void): void {
  if (review.expandedKey === key) {
    review.onExpand(null)
    return
  }
  open()
  review.onExpand(key)
}

/** The "Suggested now" card for a suggestion that has no list card (e.g. matching the other headings). */
function ActiveOnlyCard({ review }: { review: SuggestionReview }): JSX.Element | null {
  const active = review.activeFormatting
  if (!active || active.key !== 'active') return null
  return (
    <ReviewCard
      expanded={review.expandedKey === 'active'}
      highlighted
      onToggle={() => review.onExpand(review.expandedKey === 'active' ? null : 'active')}
      summary={
        <>
          <CardHeader title="Suggested now" badge="Formatting" confidence={active.confidence ?? undefined} />
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{active.label}</span>
        </>
      }
      details={<FormattingDetails review={review} cardKey="active" fallbackLabel={active.label} />}
    />
  )
}

/** Every suggestion in one list, grouped by the page it is on. */
function AllView({
  scannerSuggestions,
  mlSuggestions,
  grammarIssues,
  formattingEnabled,
  grammarEnabled,
  grammarPages,
  onOpenScanner,
  onOpenMl,
  onOpenGrammar,
  review,
}: SuggestionQueueProps): JSX.Element {
  const items: AllItem[] = []
  if (formattingEnabled) {
    mlSuggestions.forEach((s, i) =>
      items.push({
        key: `ml-${i}`,
        page: null,
        category: 'Formatting',
        onOpen: () => onOpenMl(s),
        summary: <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{formatLabel(s)}</span>,
        details: <FormattingDetails review={review} cardKey={`ml-${i}`} fallbackLabel={formatLabel(s)} />,
      })
    )
    scannerSuggestions.forEach((s) =>
      items.push({
        key: s.key,
        page: s.pageNumber,
        category: 'Formatting',
        onOpen: () => onOpenScanner(s),
        summary: (
          <>
            <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600 }}>{s.label ?? FORMAT_LABELS[s.format] ?? s.format}</span>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.detail ?? `“${s.preview}”`}</span>
          </>
        ),
        details: <FormattingDetails review={review} cardKey={s.key} fallbackLabel={s.label ?? FORMAT_LABELS[s.format] ?? s.format} />,
      })
    )
  }
  if (grammarEnabled) {
    grammarIssues.forEach((issue) =>
      items.push({
        key: grammarCardKey(grammarIssues, issue),
        page: grammarPages?.get(issue) ?? null,
        category: issue.kind === 'spelling' ? 'Spelling' : 'Grammar',
        onOpen: () => onOpenGrammar(issue),
        summary: <ChangeDiff issue={issue} />,
        details: <GrammarDetails issue={issue} review={review} />,
      })
    )
  }

  const activeOnly = formattingEnabled ? <ActiveOnlyCard review={review} /> : null
  if (items.length === 0 && !activeOnly) {
    return <EmptyState title="Nothing to review" body="Formatting suggestions, grammar and spelling issues will all be listed here by page." />
  }

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((a, b) => (a ?? 9999) - (b ?? 9999))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {activeOnly}
      {pages.map((page) => (
        <div key={page ?? 'other'} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
            {page === null ? 'Current block' : `Page ${page}`}
          </div>
          {items
            .filter((item) => item.page === page)
            .map((item) => (
              <ReviewCard
                key={item.key}
                expanded={review.expandedKey === item.key}
                onToggle={() => toggleCard(review, item.key, item.onOpen)}
                summary={
                  <>
                    <span style={{ display: 'block', marginBottom: '0.125rem' }}>
                      <Pill>{item.category}</Pill>
                    </span>
                    {item.summary}
                  </>
                }
                details={item.details}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

/**
 * One suggestion as an expandable card, Grammarly style: the summary row opens
 * it in place (and jumps to the text); the open card holds the change, why it
 * is suggested, and Accept / Dismiss. Nothing pops up over the document.
 */
function ReviewCard({
  expanded,
  highlighted = false,
  onToggle,
  summary,
  details,
}: {
  expanded: boolean
  /** The suggestion currently outlined in the document. */
  highlighted?: boolean
  onToggle: () => void
  summary: ReactNode
  details: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expanded])
  const emphasized = expanded || highlighted
  return (
    <div
      ref={ref}
      data-review-card
      data-expanded={expanded || undefined}
      style={{
        borderRadius: '0.625rem',
        border: emphasized ? '1.5px solid var(--primary)' : '1px solid var(--border)',
        backgroundColor: emphasized ? 'color-mix(in srgb, var(--primary) 5%, var(--card))' : 'var(--card)',
        boxShadow: expanded ? '0 4px 14px rgba(0, 0, 0, 0.08)' : 'none',
        transition: 'box-shadow 160ms, border-color 160ms',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          textAlign: 'left',
          padding: '0.625rem 0.75rem',
          border: 'none',
          background: 'transparent',
          color: 'var(--foreground)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>{summary}</span>
        {expanded ? (
          <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--muted-foreground)' }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--muted-foreground)' }} />
        )}
      </button>
      {expanded && <div style={{ padding: '0 0.75rem 0.75rem' }}>{details}</div>}
    </div>
  )
}

/** "original → suggestion" with the old text struck through and the fix in green. */
function ChangeDiff({ issue, replacement }: { issue: GrammarIssue; replacement?: string }): JSX.Element {
  return (
    <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-word' }}>
      <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{issue.original}</span>
      <span style={{ color: 'var(--muted-foreground)' }}> → </span>
      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{replacement ?? issue.suggestion}</span>
    </span>
  )
}

/** Accept (primary) and Dismiss (ghost) at the foot of an open card, plus an optional extra action. */
function CardActions({
  onAccept,
  onDismiss,
  acceptLabel = 'Accept',
  extra,
  disabled = false,
}: {
  onAccept: () => void
  onDismiss: () => void
  acceptLabel?: string
  extra?: ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.625rem' }}>
      <button type="button" onClick={onAccept} disabled={disabled} style={{ ...actionButton, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', opacity: disabled ? 0.5 : 1 }}>
        <Check style={{ width: 13, height: 13 }} /> {acceptLabel}
      </button>
      {extra}
      <button type="button" onClick={onDismiss} disabled={disabled} style={{ ...actionButton, backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', opacity: disabled ? 0.5 : 1 }}>
        <X style={{ width: 13, height: 13 }} /> Dismiss
      </button>
    </div>
  )
}

const actionButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  height: '1.875rem',
  padding: '0 0.75rem',
  borderRadius: '0.5rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/** The open formatting card: the change, why, and its actions (from the suggestion loaded into the document). */
function FormattingDetails({ review, cardKey, fallbackLabel }: { review: SuggestionReview; cardKey: string; fallbackLabel: string }): JSX.Element {
  const active = review.activeFormatting
  const ready = active !== null && active.key === cardKey
  // The card's summary row already names the change; the open card adds what it does and why.
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
      <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--success)' }}>
        {ready ? active.label : fallbackLabel}
        {ready && active.confidence !== null ? <span style={{ marginLeft: '0.375rem' }}><Pill strong>{Math.round(active.confidence)}%</Pill></span> : null}
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
        {ready ? (active.reason ?? 'Suggested from the document’s structure and your formatting habits.') : 'Opening this suggestion in the document…'}
      </p>
      {/* A merged card covers several blocks: its one Accept fixes them all (one undo step). */}
      <CardActions
        disabled={!ready}
        onAccept={review.onAcceptFormatting}
        onDismiss={review.onDismissFormatting}
        acceptLabel={ready && active.similarCount > 0 ? `Accept all ${active.similarCount + 1}` : 'Accept'}
      />
    </div>
  )
}

/** The open grammar/spelling card: the change (alternatives for spelling), the rule, Accept / Dismiss. */
function GrammarDetails({ issue, review }: { issue: GrammarIssue; review: SuggestionReview }): JSX.Element {
  const choices = Array.from(new Set([issue.suggestion, ...(issue.suggestions ?? [])].filter((choice) => choice && choice.trim().length > 0)))
  const [choice, setChoice] = useState<string>(choices[0] ?? issue.suggestion)
  // The summary row shows the category and the change; the open card adds the
  // choice of correction (spelling), the rule behind it and the actions.
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
      {choices.length > 1 && <ChangeDiff issue={issue} replacement={choice} />}
      {choices.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }} role="radiogroup" aria-label="Choose a correction">
          {choices.map((option) => (
            <FilterChip key={option} active={option === choice} onClick={() => setChoice(option)}>
              {option}
            </FilterChip>
          ))}
        </div>
      )}
      {issue.explanation && (
        <p style={{ margin: choices.length > 1 ? '0.375rem 0 0' : 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>{issue.explanation}</p>
      )}
      <CardActions onAccept={() => review.onAcceptGrammar(issue, choice)} onDismiss={() => review.onDismissGrammar(issue)} />
    </div>
  )
}

/** Formatting view: scanner suggestions sorted by page, then learned/ML predictions. */
function FormattingView({
  scannerSuggestions,
  activeScannerKey,
  mlSuggestions,
  onOpenScanner,
  onOpenMl,
  review,
}: SuggestionQueueProps): JSX.Element {
  const sorted = [...scannerSuggestions].sort((a, b) => a.pageNumber - b.pageNumber || a.from - b.from)
  const activeOnly = <ActiveOnlyCard review={review} />

  if (sorted.length === 0 && mlSuggestions.length === 0 && !review.activeFormatting) {
    return (
      <EmptyState
        title="Nothing to format"
        body="As you write, formatting suggestions for headings, lists and your own habits will show up here."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {activeOnly}
      {mlSuggestions.map((s, i) => (
        <ReviewCard
          key={`ml-${i}`}
          expanded={review.expandedKey === `ml-${i}`}
          onToggle={() => toggleCard(review, `ml-${i}`, () => onOpenMl(s))}
          summary={
            <>
              <CardHeader title={formatLabel(s)} badge={s.suggestionSource === 'learned' ? 'Learned from you' : 'Suggested'} confidence={s.confidence} />
              <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>{s.reason}</span>
            </>
          }
          details={<FormattingDetails review={review} cardKey={`ml-${i}`} fallbackLabel={formatLabel(s)} />}
        />
      ))}
      {sorted.map((s) => {
        const members = s.groupMembers?.length ?? 0
        return (
          <ReviewCard
            key={s.key}
            expanded={review.expandedKey === s.key}
            highlighted={activeScannerKey === s.key}
            onToggle={() => toggleCard(review, s.key, () => onOpenScanner(s))}
            summary={
              <>
                <CardHeader title={s.label ?? FORMAT_LABELS[s.format] ?? s.format} badge={`Page ${s.pageNumber}`} confidence={s.confidence} />
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.detail ?? `“${s.preview}”${members > 0 ? ` and ${members} similar` : ''}`}
                </span>
              </>
            }
            details={<FormattingDetails review={review} cardKey={s.key} fallbackLabel={s.label ?? FORMAT_LABELS[s.format] ?? s.format} />}
          />
        )
      })}
    </div>
  )
}

type GrammarFilter = 'all' | 'grammar' | 'spelling'

/** Grammar view: filterable issues; each card opens in place with the fix and Accept / Dismiss. */
function GrammarView({
  grammarIssues,
  grammarLoading,
  grammarError,
  grammarCheckedAt,
  grammarPages,
  onCheckGrammar,
  onOpenGrammar,
  review,
}: SuggestionQueueProps): JSX.Element {
  const [filter, setFilter] = useState<GrammarFilter>('all')
  const grammarCount = grammarIssues.filter((i) => i.kind !== 'spelling').length
  const spellingCount = grammarIssues.length - grammarCount
  const shown = grammarIssues.filter((i) => filter === 'all' || (filter === 'spelling' ? i.kind === 'spelling' : i.kind !== 'spelling'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All {grammarIssues.length}</FilterChip>
          <FilterChip active={filter === 'grammar'} onClick={() => setFilter('grammar')}>Grammar {grammarCount}</FilterChip>
          <FilterChip active={filter === 'spelling'} onClick={() => setFilter('spelling')}>Spelling {spellingCount}</FilterChip>
        </div>
        <button
          type="button"
          onClick={onCheckGrammar}
          disabled={grammarLoading}
          title="Check the document now"
          className="panel-icon-btn"
          style={{ opacity: grammarLoading ? 0.5 : 1 }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} className={grammarLoading ? 'animate-spin' : undefined} />
        </button>
      </div>
      {grammarError ? (
        <CardNote>Couldn’t check right now. Your text is safe — try the refresh button in a moment.</CardNote>
      ) : (
        <CardNote>
          {grammarLoading
            ? 'Checking…'
            : grammarCheckedAt
              ? `Last checked ${new Date(grammarCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Checks automatically while you write.'}
        </CardNote>
      )}
      {shown.length === 0 ? (
        <EmptyState
          title={grammarIssues.length === 0 ? 'No issues found' : 'Nothing in this filter'}
          body={grammarIssues.length === 0 ? 'Grammar and spelling look good.' : 'Switch the filter to see the other issues.'}
        />
      ) : (
        shown.map((issue) => {
          const key = grammarCardKey(grammarIssues, issue)
          return (
            <ReviewCard
              key={key}
              expanded={review.expandedKey === key}
              onToggle={() => toggleCard(review, key, () => onOpenGrammar(issue))}
              summary={
                <>
                  <CardHeader title={issue.kind === 'spelling' ? 'Spelling' : 'Grammar'} badge={grammarPages?.has(issue) ? `Page ${grammarPages.get(issue)}` : ''} hideBadge={!grammarPages?.has(issue)} />
                  <ChangeDiff issue={issue} />
                </>
              }
              details={<GrammarDetails issue={issue} review={review} />}
            />
          )
        })
      )}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  badge: string
  confidence?: number
  hideBadge?: boolean
}

function CardHeader({ title, badge, confidence, hideBadge = false }: CardHeaderProps): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
      {/* The title wraps instead of cutting off: labels are short sentences that need reading in full. */}
      <span
        title={title}
        style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.35, color: 'var(--foreground)', overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {title}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
        {hideBadge ? null : <Pill>{badge}</Pill>}
        {typeof confidence === 'number' ? <Pill strong>{Math.round(confidence)}%</Pill> : null}
      </span>
    </div>
  )
}

function Pill({ children, strong = false }: { children: ReactNode; strong?: boolean }): JSX.Element {
  return (
    <span
      style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        padding: '0.125rem 0.375rem',
        borderRadius: '999px',
        color: strong ? 'var(--primary)' : 'var(--muted-foreground)',
        backgroundColor: strong ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--secondary)',
      }}
    >
      {children}
    </span>
  )
}

function CardNote({ children }: { children: ReactNode }): JSX.Element {
  return <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>{children}</p>
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        padding: '0.1875rem 0.5rem',
        borderRadius: '999px',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        backgroundColor: active ? 'var(--foreground)' : 'transparent',
        color: active ? 'var(--background)' : 'var(--foreground)',
      }}
    >
      {children}
    </button>
  )
}

function EmptyState({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{title}</p>
      <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>{body}</p>
    </div>
  )
}
