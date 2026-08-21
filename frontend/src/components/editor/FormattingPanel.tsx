import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
import {
  api,
  type FormatBinding,
  type FormatPreset,
  type TriggerCondition,
} from '@/services/api'
import { FORMAT_LABELS } from './SuggestionPanel'

const FORMAT_OPTIONS = Object.keys(FORMAT_LABELS)

interface FormattingPanelProps {
  documentId: string | undefined
  activePreset: string | null
  onPresetChange: (preset: string | null) => void
}

interface BindingForm {
  maxWords: string
  standaloneLine: boolean
  format: string
  priority: string
}

const EMPTY_FORM: BindingForm = {
  maxWords: '',
  standaloneLine: false,
  format: 'heading2',
  priority: '10',
}

/**
 * Tier 1 (preset picker) + Tier 2 (custom bindings) management panel.
 * Renders in the right sidebar of the document editor.
 */
export default function FormattingPanel({
  documentId,
  activePreset,
  onPresetChange,
}: FormattingPanelProps): JSX.Element {
  const [presets, setPresets] = useState<FormatPreset[]>([])
  const [bindings, setBindings] = useState<FormatBinding[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [showForm, setShowForm] = useState<boolean>(false)
  const [form, setForm] = useState<BindingForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadPresets()
    void loadBindings()
  }, [])

  async function loadPresets(): Promise<void> {
    try {
      const response = await api.formatting.listPresets()
      setPresets(response)
    } catch (err) {
      console.error('Failed to load presets', err)
    }
  }

  async function loadBindings(): Promise<void> {
    try {
      const response = await api.formatting.listBindings()
      setBindings(response)
    } finally {
      setLoading(false)
    }
  }

  async function handlePresetSelect(key: string): Promise<void> {
    if (!documentId) return
    try {
      await api.formatting.setDocumentPreset(documentId, key)
      onPresetChange(key)
    } catch (err) {
      console.error('Failed to apply preset', err)
    }
  }

  function handleFormField(field: keyof BindingForm, value: string | boolean): void {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCreateBinding(): Promise<void> {
    setError(null)

    const maxWords = Number(form.maxWords)
    if (!Number.isFinite(maxWords) || maxWords <= 0) {
      setError('Max words must be a positive number')
      return
    }

    const condition: TriggerCondition = {
      maxWords,
      standaloneLine: form.standaloneLine,
    }

    try {
      await api.formatting.createBinding(condition, form.format, Number(form.priority) || 0)
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadBindings()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create binding'
      setError(message)
    }
  }

  async function handleDeleteBinding(id: string): Promise<void> {
    try {
      await api.formatting.deleteBinding(id)
      setBindings((prev) => prev.filter((b) => b.id !== id))
    } catch (err) {
      console.error('Failed to delete binding', err)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* ── Tier 1: Presets ── */}
      <div>
        <p
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--muted-foreground)',
            margin: '0 0 0.625rem',
          }}
        >
          Formatting preset
        </p>

        <select
          value={activePreset ?? 'custom'}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            void handlePresetSelect(e.target.value)
          }}
          style={{
            width: '100%',
            height: '36px',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: '0.8125rem',
            padding: '0 0.625rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        >
          {presets.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.name}
            </option>
          ))}
        </select>

        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--muted-foreground)',
            margin: '0.5rem 0 0',
            lineHeight: 1.4,
          }}
        >
          {presets.find((p) => p.key === activePreset)?.description ??
            'Start with an empty profile and let your custom bindings define formatting.'}
        </p>
      </div>

      {/* ── Tier 2: Custom bindings ── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.625rem',
          }}
        >
          <p
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
              margin: 0,
            }}
          >
            Custom rules
          </p>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--primary)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            <Plus style={{ width: '12px', height: '12px' }} />
            {showForm ? 'Cancel' : 'New'}
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>Loading…</p>
        ) : bindings.length === 0 && !showForm ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
            No custom rules yet. Add one to hard-rule a pattern.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {bindings.map((binding) => (
              <div
                key={binding.id}
                style={{
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  padding: '0.625rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                    {FORMAT_LABELS[binding.format_to_apply] ?? binding.format_to_apply}
                  </p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0.125rem 0 0' }}>
                    ≤ {binding.trigger_condition.maxWords ?? '∞'} words
                    {binding.trigger_condition.standaloneLine ? ' · own line' : ''}
                    {' · priority '}
                    {binding.priority}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete binding"
                  onClick={() => void handleDeleteBinding(binding.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 style={{ width: '13px', height: '13px' }} />
                </button>
              </div>
            ))}

            {showForm && (
              <div
                style={{
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <input
                  type="number"
                  min={1}
                  placeholder="Max words (e.g. 8)"
                  value={form.maxWords}
                  onChange={(e) => handleFormField('maxWords', e.target.value)}
                  style={inputStyle}
                />
                <select
                  value={form.format}
                  onChange={(e) => handleFormField('format', e.target.value)}
                  style={selectStyle}
                >
                  {FORMAT_OPTIONS.map((format) => (
                    <option key={format} value={format}>
                      {FORMAT_LABELS[format]}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  <input
                    type="checkbox"
                    checked={form.standaloneLine}
                    onChange={(e) => handleFormField('standaloneLine', e.target.checked)}
                  />
                  Own line only
                </label>
                {error && <p style={{ fontSize: '0.6875rem', color: '#ff5b4f', margin: 0 }}>{error}</p>}
                <button
                  type="button"
                  onClick={() => void handleCreateBinding()}
                  style={{
                    height: '32px',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add rule
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <Layers style={{ width: '12px', height: '12px', color: 'var(--muted-foreground)' }} />
        <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
          Rules apply before ML predictions. Set a preset, or clear it to use your custom rules.
        </span>
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  height: '34px',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: '0.75rem',
  padding: '0 0.625rem',
  fontFamily: 'inherit',
  outline: 'none',
}

const selectStyle: CSSProperties = {
  height: '34px',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: '0.75rem',
  padding: '0 0.625rem',
  fontFamily: 'inherit',
  outline: 'none',
}
