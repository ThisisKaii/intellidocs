import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Layers, Loader2, X } from 'lucide-react'

import type { ProposedTab } from '@/lib/documentTabs'

/**
 * "Split into chapter tabs?" — shown when a document with chapters is opened (and from the left
 * panel any time). Lists the proposed tabs; each can be renamed, and any but the first can be kept
 * with the tab above instead of getting its own.
 */

export interface SplitChoice {
  tabs: ProposedTab[]
}

interface SplitTabsDialogProps {
  open: boolean
  proposal: ProposedTab[]
  /** Words in each proposed tab, in order (for the preview). */
  wordCounts: number[]
  busy: boolean
  error: string
  onSplit: (tabs: ProposedTab[]) => void
  /** "Not now": the dialog does not open by itself again for this document. */
  onDismiss: () => void
}

const KIND_LABEL: Record<ProposedTab['kind'], string> = { front: 'Front matter', chapter: 'Chapter', back: 'Back matter' }

export default function SplitTabsDialog({ open, proposal, wordCounts, busy, error, onSplit, onDismiss }: SplitTabsDialogProps): JSX.Element | null {
  const [titles, setTitles] = useState<string[]>([])
  const [separate, setSeparate] = useState<boolean[]>([])

  useEffect(() => {
    if (!open) return
    setTitles(proposal.map((tab) => tab.title))
    setSeparate(proposal.map(() => true))
  }, [open, proposal])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onDismiss])

  // What the split will make: tabs kept separate, each with the words of the ones folded into it.
  const result = useMemo(() => {
    const tabs: Array<{ tab: ProposedTab; words: number }> = []
    proposal.forEach((tab, index) => {
      const words = wordCounts[index] ?? 0
      if (index === 0 || separate[index] !== false) tabs.push({ tab: { ...tab, title: (titles[index] ?? tab.title).trim() || tab.title }, words })
      else tabs[tabs.length - 1].words += words
    })
    return tabs
  }, [proposal, wordCounts, separate, titles])

  if (!open) return null

  return createPortal(
    <div
      className="animate-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
      onClick={() => !busy && onDismiss()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-tabs-title"
        className="animate-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '34rem',
          maxHeight: '85vh',
          overflowY: 'auto',
          borderRadius: '0.75rem',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--foreground)',
          padding: '1.25rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <h2 id="split-tabs-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers style={{ width: '18px', height: '18px' }} /> Split into chapter tabs?
          </h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onDismiss} style={iconButton}>
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
        <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Each chapter opens in its own tab, so a long manuscript stays fast to open and type in. It is still one
          document: sharing, version history and downloads cover every tab, and you can merge the tabs back at any time.
        </p>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {proposal.map((tab, index) => {
            const own = index === 0 || separate[index] !== false
            return (
              <li
                key={`${tab.start}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: own ? 'var(--background)' : 'transparent',
                  opacity: own ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={own}
                  disabled={index === 0 || busy}
                  aria-label={index === 0 ? 'The first tab' : `Give “${titles[index] ?? tab.title}” its own tab`}
                  title={index === 0 ? 'The first tab' : own ? 'Its own tab (untick to keep it with the tab above)' : 'Kept with the tab above'}
                  onChange={(event) => setSeparate((current) => current.map((value, i) => (i === index ? event.target.checked : value)))}
                />
                <input
                  value={titles[index] ?? tab.title}
                  maxLength={120}
                  disabled={!own || busy}
                  aria-label="Tab title"
                  onChange={(event) => setTitles((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.375rem',
                    borderRadius: '0.375rem',
                    border: '1px solid transparent',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                  {KIND_LABEL[tab.kind]} · {(wordCounts[index] ?? 0).toLocaleString()} words
                </span>
              </li>
            )
          })}
        </ol>

        {error && (
          <p role="alert" style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--destructive, #dc2626)' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" disabled={busy} onClick={onDismiss} style={secondaryButton}>
            Not now
          </button>
          <button type="button" disabled={busy || result.length < 2} onClick={() => onSplit(result.map((entry) => entry.tab))} style={primaryButton}>
            {busy ? <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> : null}
            Split into {result.length} tabs
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const iconButton: CSSProperties = {
  display: 'inline-flex',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  padding: '0.25rem',
}

const primaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  padding: '0.5rem 0.875rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryButton: CSSProperties = {
  ...primaryButton,
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
}
