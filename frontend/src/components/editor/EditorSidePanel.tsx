import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { motion } from 'framer-motion'
import {
  Bot,
  ChevronRight,
  Sparkles,
  History,
  Wrench,
  RefreshCw,
  SpellCheck2,
  Wand2,
  HelpCircle,
} from 'lucide-react'
import AIChatbot from './AIChatbot'
import HistoryPanel from './HistoryPanel'
import type { DocumentVersion } from '@/services/api'
import { FORMAT_LABELS, formatLabel } from './SuggestionPanel'
import type { ScannerSuggestion } from '@/hooks/useAutoFormatScanner'
import type { GrammarIssue } from './GrammarPanel'
import type { Suggestion } from './SuggestionPanel'

export type SidePanelTab = 'assistant' | 'suggestions' | 'tools' | 'history'

type QueueView = 'all' | 'formatting' | 'grammar'

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
  /** Jump to a formatting suggestion in the document and open its popup there. */
  onOpenScanner: (suggestion: ScannerSuggestion) => void
  onOpenMl: (suggestion: Suggestion) => void
  /** Jump to a grammar/spelling issue and open its fix popover there. */
  onOpenGrammar: (issue: GrammarIssue) => void
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
}: EditorSidePanelProps): JSX.Element {
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
            overflowX: 'auto',
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
              docked
            />
          </div>
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.375rem 0.5rem',
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
      {icon}
      {label}
      {count ? (
        <span
          style={{
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
}

/** Suggestions tab: a switch between formatting suggestions and grammar/spelling issues. */
function SuggestionQueue(props: SuggestionQueueProps): JSX.Element {
  const { scannerSuggestions, mlSuggestions, grammarIssues, formattingEnabled, grammarEnabled } = props
  const [view, setView] = useState<QueueView>(readStoredView)

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
      <p style={{ margin: '-0.375rem 0 0', fontSize: '0.6875rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
        Pick an item to jump to it. You accept or dismiss it in the document.
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
  body: ReactNode
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
}: SuggestionQueueProps): JSX.Element {
  const items: AllItem[] = []
  if (formattingEnabled) {
    mlSuggestions.forEach((s, i) =>
      items.push({
        key: `ml-${i}`,
        page: null,
        category: 'Formatting',
        onOpen: () => onOpenMl(s),
        body: <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{formatLabel(s)}</span>,
      })
    )
    scannerSuggestions.forEach((s) =>
      items.push({
        key: s.key,
        page: s.pageNumber,
        category: 'Formatting',
        onOpen: () => onOpenScanner(s),
        body: (
          <>
            <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600 }}>{s.label ?? FORMAT_LABELS[s.format] ?? s.format}</span>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{s.preview}”</span>
          </>
        ),
      })
    )
  }
  if (grammarEnabled) {
    grammarIssues.forEach((issue, i) =>
      items.push({
        key: `g-${i}`,
        page: grammarPages?.get(issue) ?? null,
        category: issue.kind === 'spelling' ? 'Spelling' : 'Grammar',
        onOpen: () => onOpenGrammar(issue),
        body: (
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-word' }}>
            <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{issue.original}</span>
            <span style={{ color: 'var(--muted-foreground)' }}> → </span>
            <span style={{ color: 'var(--success)' }}>{issue.suggestion}</span>
          </span>
        ),
      })
    )
  }

  if (items.length === 0) {
    return <EmptyState title="Nothing to review" body="Formatting suggestions, grammar and spelling issues will all be listed here by page." />
  }

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((a, b) => (a ?? 9999) - (b ?? 9999))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {pages.map((page) => (
        <div key={page ?? 'other'} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
            {page === null ? 'Current block' : `Page ${page}`}
          </div>
          {items
            .filter((item) => item.page === page)
            .map((item) => (
              <NavCard key={item.key} active={false} onClick={item.onOpen}>
                <span style={{ display: 'block', marginBottom: '0.125rem' }}>
                  <Pill>{item.category}</Pill>
                </span>
                {item.body}
              </NavCard>
            ))}
        </div>
      ))}
    </div>
  )
}

/** One clickable row in a suggestion list: the whole card jumps to its place in the document. */
function NavCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
        textAlign: 'left',
        padding: '0.625rem 0.75rem',
        borderRadius: '0.625rem',
        border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
        backgroundColor: active ? 'color-mix(in srgb, var(--primary) 7%, var(--card))' : 'var(--card)',
        color: 'var(--foreground)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      <ChevronRight style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--muted-foreground)' }} />
    </button>
  )
}

/** Formatting view: scanner suggestions sorted by page, then learned/ML predictions. */
function FormattingView({
  scannerSuggestions,
  activeScannerKey,
  mlSuggestions,
  onOpenScanner,
  onOpenMl,
}: SuggestionQueueProps): JSX.Element {
  const activeRef = useRef<HTMLDivElement | null>(null)
  const sorted = [...scannerSuggestions].sort((a, b) => a.pageNumber - b.pageNumber || a.from - b.from)

  // Keep the card for the suggestion currently outlined in the document in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeScannerKey])

  if (sorted.length === 0 && mlSuggestions.length === 0) {
    return (
      <EmptyState
        title="Nothing to format"
        body="As you write, formatting suggestions for headings, lists and your own habits will show up here."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {mlSuggestions.map((s, i) => (
        <NavCard key={`ml-${i}`} active={false} onClick={() => onOpenMl(s)}>
          <CardHeader
            title={formatLabel(s)}
            badge={s.suggestionSource === 'learned' ? 'Learned from you' : 'Suggested'}
            confidence={s.confidence}
          />
          <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>{s.reason}</span>
        </NavCard>
      ))}
      {sorted.map((s) => {
        const isActive = activeScannerKey === s.key
        const members = s.groupMembers?.length ?? 0
        return (
          <div key={s.key} ref={isActive ? activeRef : undefined}>
            <NavCard active={isActive} onClick={() => onOpenScanner(s)}>
              <CardHeader title={s.label ?? FORMAT_LABELS[s.format] ?? s.format} badge={`Page ${s.pageNumber}`} confidence={s.confidence} />
              <span
                style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                “{s.preview}”{members > 0 ? ` and ${members} similar` : ''}
              </span>
            </NavCard>
          </div>
        )
      })}
    </div>
  )
}

type GrammarFilter = 'all' | 'grammar' | 'spelling'

/** Grammar view: filterable issues; each row jumps to the word and opens its fix in the document. */
function GrammarView({
  grammarIssues,
  grammarLoading,
  grammarError,
  grammarCheckedAt,
  grammarPages,
  onCheckGrammar,
  onOpenGrammar,
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
        shown.map((issue, i) => (
          <NavCard key={`${issue.original}-${i}`} active={false} onClick={() => onOpenGrammar(issue)}>
            <CardHeader title={issue.kind === 'spelling' ? 'Spelling' : 'Grammar'} badge={grammarPages?.has(issue) ? `Page ${grammarPages.get(issue)}` : ''} hideBadge={!grammarPages?.has(issue)} />
            <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-word' }}>
              <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{issue.original}</span>
              <span style={{ color: 'var(--muted-foreground)' }}> → </span>
              <span style={{ color: 'var(--success)' }}>{issue.suggestion}</span>
            </span>
          </NavCard>
        ))
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
      <span
        title={title}
        style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
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
