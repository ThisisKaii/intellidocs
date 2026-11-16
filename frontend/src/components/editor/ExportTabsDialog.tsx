import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, X } from 'lucide-react'

import type { DocumentTabSummary } from '@/services/api'
import type { ExportFormat, TabExportSelection } from '@/lib/tabExport'

/**
 * "What do you want to download?" for a document split into tabs: the open tab, the whole
 * document, or chosen tabs (an adviser asking for Chapters 1–3). The Word thesis export can number
 * a single tab's pages from where the tab really starts, or from 1.
 */

const FORMAT_LABEL: Record<ExportFormat, string> = {
  word: 'Word document',
  ieeeWord: 'IEEE Word document',
  thesisWord: 'Thesis (Defense-Ready) Word document',
  pdf: 'PDF',
  html: 'HTML',
  print: 'Print',
}

export interface ExportChoice {
  selection: TabExportSelection
  /** Number the pages from 1 instead of the tab's real starting page. */
  numberFromOne: boolean
}

interface ExportTabsDialogProps {
  format: ExportFormat | null
  tabs: DocumentTabSummary[]
  openTabId: string | null
  busy: boolean
  error: string
  /** Opened from a tab's own menu: that tab is preselected. */
  presetTabId?: string | null
  onFormatChange?: (format: ExportFormat) => void
  onExport: (choice: ExportChoice) => void
  onClose: () => void
}

export default function ExportTabsDialog({ format, tabs, openTabId, busy, error, presetTabId = null, onFormatChange, onExport, onClose }: ExportTabsDialogProps): JSX.Element | null {
  const [kind, setKind] = useState<TabExportSelection['kind']>('whole')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [numberFromOne, setNumberFromOne] = useState(false)

  useEffect(() => {
    if (!format) return
    setKind(presetTabId ? 'tabs' : 'whole')
    setChosen(new Set(presetTabId ? [presetTabId] : openTabId ? [openTabId] : []))
    setNumberFromOne(false)
    // Only when the dialog opens (not when the format is changed inside it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format === null, openTabId, presetTabId])

  useEffect(() => {
    if (!format) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [format, busy, onClose])

  if (!format) return null
  const openTitle = tabs.find((tab) => tab.tab_id === openTabId)?.title ?? 'This tab'
  const selection: TabExportSelection = kind === 'tabs' ? { kind: 'tabs', tabIds: Array.from(chosen) } : kind === 'tab' ? { kind: 'tab' } : { kind: 'whole' }
  const canExport = kind !== 'tabs' || chosen.size > 0
  // Only the Word thesis export prints page numbers, and only part of the document starts later than 1.
  const offersNumbering = format === 'thesisWord' && kind !== 'whole'

  return createPortal(
    <div
      className="animate-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-tabs-title"
        className="animate-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '28rem',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="export-tabs-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {format === 'print' ? 'Print' : `Download as ${FORMAT_LABEL[format]}`}
          </h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} style={iconButton}>
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {onFormatChange && format !== 'print' && (
          <label style={{ ...optionStyle, marginTop: '0.75rem', fontSize: '0.8125rem' }}>
            Format
            <select
              value={format}
              onChange={(event) => onFormatChange(event.target.value as ExportFormat)}
              style={{ fontSize: '0.8125rem', padding: '0.25rem', borderRadius: '0.375rem', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            >
              {(['word', 'thesisWord', 'ieeeWord', 'pdf', 'html'] as const).map((value) => (
                <option key={value} value={value}>
                  {FORMAT_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset style={{ border: 'none', margin: '0.75rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>Which part?</legend>
          <label style={optionStyle}>
            <input type="radio" name="export-part" checked={kind === 'whole'} onChange={() => setKind('whole')} /> The whole document ({tabs.length} tabs)
          </label>
          <label style={optionStyle}>
            <input type="radio" name="export-part" checked={kind === 'tab'} onChange={() => setKind('tab')} /> This tab: {openTitle}
          </label>
          <label style={optionStyle}>
            <input type="radio" name="export-part" checked={kind === 'tabs'} onChange={() => setKind('tabs')} /> Choose tabs…
          </label>
          {kind === 'tabs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.25rem 0 0 1.5rem' }}>
              {tabs.map((tab) => (
                <label key={tab.tab_id} style={{ ...optionStyle, fontSize: '0.8125rem' }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(tab.tab_id)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(tab.tab_id)
                        else next.delete(tab.tab_id)
                        return next
                      })
                    }
                  />
                  {tab.title}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {offersNumbering && (
          <label style={{ ...optionStyle, marginTop: '0.75rem', fontSize: '0.8125rem' }}>
            <input type="checkbox" checked={numberFromOne} onChange={(event) => setNumberFromOne(event.target.checked)} />
            Number the pages from 1 (otherwise they keep their page numbers in the whole document)
          </label>
        )}

        {error && (
          <p role="alert" style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--destructive, #dc2626)' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" disabled={busy} onClick={onClose} style={secondaryButton}>
            Cancel
          </button>
          <button type="button" disabled={busy || !canExport} onClick={() => onExport({ selection, numberFromOne })} style={primaryButton}>
            {busy ? <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} /> : <Download style={{ width: '14px', height: '14px' }} />}
            {format === 'print' ? 'Print' : 'Download'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const optionStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }

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
