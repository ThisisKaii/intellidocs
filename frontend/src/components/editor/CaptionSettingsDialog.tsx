import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { captionLabel, type CaptionConfig, type CaptionKind, type CaptionKindConfig } from './captionNumbering'

/**
 * Page Setup → Captions: how this document's figure and table captions are placed and written.
 * Starts from the document's own settings or its preset's; "Use preset defaults" goes back to the
 * preset. New captions follow the settings, and existing labels are relabelled ("Fig." / "Figure").
 */

interface CaptionSettingsDialogProps {
  open: boolean
  /** The settings in force (the document's own, else its preset's). */
  config: CaptionConfig
  /** Whether the document has its own settings (else it follows the preset). */
  custom: boolean
  presetName: string
  busy?: boolean
  error?: string
  onSave: (config: CaptionConfig) => void
  onUsePreset: () => void
  onClose: () => void
}

const LABELS: Record<CaptionKind, CaptionKindConfig['label'][]> = {
  figure: ['Figure', 'Fig.', 'FIGURE'],
  table: ['Table', 'TABLE', 'Tab.'],
}
const SEPARATORS: Array<{ value: CaptionKindConfig['separator']; text: string }> = [
  { value: '. ', text: 'Period  (Figure 1. Title)' },
  { value: ': ', text: 'Colon  (Figure 1: Title)' },
  { value: ' — ', text: 'Dash  (Figure 1 — Title)' },
  { value: 'line', text: 'Title on the next line' },
]
const SIZES = ['', '8pt', '9pt', '10pt', '11pt', '12pt']

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }
const control: React.CSSProperties = {
  height: '2rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  padding: '0 0.5rem',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
}

/** How a caption of this kind will read, for the preview line. */
function preview(kind: CaptionKind, config: CaptionKindConfig): JSX.Element {
  const label = captionLabel(kind, 1, { figure: config, table: config })
  const title = kind === 'figure' ? 'System Architecture' : 'Respondent Profile'
  const style: React.CSSProperties = {
    textAlign: config.alignment,
    fontSize: config.fontSize || '12pt',
    fontFamily: config.fontFamily || 'Times New Roman, serif',
    margin: 0,
  }
  return (
    <p style={style}>
      <span style={{ fontWeight: config.boldLabel ? 700 : 400 }}>{label}</span>
      {config.separator === 'line' ? <br /> : config.separator}
      <span style={{ fontStyle: config.italicText ? 'italic' : 'normal' }}>{title}</span>
    </p>
  )
}

function KindSettings({
  kind,
  value,
  onChange,
}: {
  kind: CaptionKind
  value: CaptionKindConfig
  onChange: (next: CaptionKindConfig) => void
}): JSX.Element {
  const set = <K extends keyof CaptionKindConfig>(key: K, next: CaptionKindConfig[K]): void => onChange({ ...value, [key]: next })
  const noun = kind === 'figure' ? 'figure' : 'table'
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', minWidth: 0 }}>
      <legend style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted-foreground)' }}>
        {kind === 'figure' ? 'Figures' : 'Tables'}
      </legend>
      <label style={field}>
        Placement
        <select aria-label={`${noun} caption placement`} value={value.placement} onChange={(e) => set('placement', e.target.value as CaptionKindConfig['placement'])} style={control}>
          <option value="top">Above the {noun}</option>
          <option value="bottom">Below the {noun}</option>
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <label style={field}>
          Label
          <select aria-label={`${noun} caption label`} value={value.label} onChange={(e) => set('label', e.target.value as CaptionKindConfig['label'])} style={control}>
            {LABELS[kind].map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <label style={field}>
          Numbers
          <select aria-label={`${noun} caption numbers`} value={value.numerals} onChange={(e) => set('numerals', e.target.value as CaptionKindConfig['numerals'])} style={control}>
            <option value="arabic">1, 2, 3</option>
            <option value="roman">I, II, III</option>
          </select>
        </label>
      </div>
      <label style={field}>
        After the label
        <select aria-label={`${noun} caption separator`} value={value.separator} onChange={(e) => set('separator', e.target.value as CaptionKindConfig['separator'])} style={control}>
          {SEPARATORS.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <label style={field}>
          Size
          <select aria-label={`${noun} caption size`} value={value.fontSize} onChange={(e) => set('fontSize', e.target.value)} style={control}>
            {SIZES.map((size) => <option key={size || 'body'} value={size}>{size || 'Body size'}</option>)}
          </select>
        </label>
        <label style={field}>
          Alignment
          <select aria-label={`${noun} caption alignment`} value={value.alignment} onChange={(e) => set('alignment', e.target.value as CaptionKindConfig['alignment'])} style={control}>
            <option value="center">Centred</option>
            <option value="left">Left</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <input type="checkbox" checked={value.boldLabel} onChange={(e) => set('boldLabel', e.target.checked)} /> Bold label
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <input type="checkbox" checked={value.italicText} onChange={(e) => set('italicText', e.target.checked)} /> Italic title
        </label>
      </div>
      <div aria-label={`${noun} caption preview`} style={{ borderRadius: '0.5rem', background: 'var(--secondary)', padding: '0.625rem 0.75rem', color: 'var(--foreground)' }}>
        {preview(kind, value)}
      </div>
    </fieldset>
  )
}

export default function CaptionSettingsDialog({
  open,
  config,
  custom,
  presetName,
  busy = false,
  error = '',
  onSave,
  onUsePreset,
  onClose,
}: CaptionSettingsDialogProps): JSX.Element | null {
  const [draft, setDraft] = useState<CaptionConfig>(config)
  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])
  if (!open) return null

  return createPortal(
    <div
      onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="caption-settings-title"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(44rem, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', color: 'var(--foreground)', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2 id="caption-settings-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Captions</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
              {custom ? 'This document uses its own caption settings.' : `Following the ${presetName} preset.`} New captions follow these settings; existing labels are updated.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          <KindSettings kind="figure" value={draft.figure} onChange={(figure) => setDraft({ ...draft, figure })} />
          <KindSettings kind="table" value={draft.table} onChange={(table) => setDraft({ ...draft, table })} />
        </div>

        {error && <p role="alert" style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--destructive, #dc2626)' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy || !custom}
            onClick={onUsePreset}
            style={{ height: '2rem', padding: '0 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.8125rem', cursor: custom ? 'pointer' : 'default', opacity: custom ? 1 : 0.5 }}
          >
            Use {presetName} defaults
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={busy} onClick={onClose} style={{ height: '2rem', padding: '0 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.8125rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => onSave(draft)} style={{ height: '2rem', padding: '0 0.875rem', borderRadius: '0.5rem', border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
              Save captions
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
