import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Download, FileUp, Loader2, Trash2, Upload } from 'lucide-react'

import { api, type SharedPresetFile, type UserPreset } from '@/services/api'
import { USER_PRESETS_CHANGED } from './academicPresets'

/** File extension of a shared preset. */
const PRESET_EXTENSION = '.idocpreset'

const headingStyle: CSSProperties = {
  margin: '0 0 0.25rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--muted-foreground)',
}

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.375rem 0.625rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const iconButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  padding: '0.25rem',
}

/** Tell open pages the user's presets changed, so documents pick up the new looks. */
function announceChange(): void {
  window.dispatchEvent(new Event(USER_PRESETS_CHANGED))
}

/** Save a preset as a .idocpreset file the user can send to others. */
function downloadPreset(preset: UserPreset): void {
  if (!preset.blueprint) return
  const shared: SharedPresetFile = {
    format: 'intellidocs-preset',
    name: preset.name,
    description: preset.description,
    baseKey: preset.base_key,
    blueprint: preset.blueprint,
  }
  const blob = new Blob([JSON.stringify(shared, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${preset.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'preset'}${PRESET_EXTENSION}`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * "Presets from your documents": upload a document already in your format and it becomes a
 * preset (page, body text, headings and outline); save one as a .idocpreset file to share, or add
 * one someone shared with you. A professor can hand a class one file and every student gets the
 * same format.
 */
export default function DocumentPresetsSection(): JSX.Element {
  const [presets, setPresets] = useState<UserPreset[]>([])
  const [busy, setBusy] = useState<'file' | 'import' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)

  function reload(): void {
    api.formatting
      .listUserPresets()
      .then((list) => setPresets(list.filter((preset) => preset.blueprint)))
      .catch(() => setPresets([]))
  }

  useEffect(reload, [])

  async function makeFromFile(file: File): Promise<void> {
    setBusy('file')
    setError('')
    setNotice('')
    try {
      const preset = await api.formatting.createUserPresetFromFile(file)
      setNotice(`Added “${preset.name}”. Pick it under Presets to format a document like it.`)
      reload()
      announceChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make a preset from that file.')
    } finally {
      setBusy(null)
    }
  }

  async function importShared(file: File): Promise<void> {
    setBusy('import')
    setError('')
    setNotice('')
    try {
      const parsed = JSON.parse(await file.text()) as SharedPresetFile
      if (parsed?.format !== 'intellidocs-preset') throw new Error('That file is not an IntelliDocs preset.')
      const preset = await api.formatting.importUserPreset(parsed)
      setNotice(`Added “${preset.name}”.`)
      reload()
      announceChange()
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file is not an IntelliDocs preset.' : err instanceof Error ? err.message : 'Could not add that preset.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(preset: UserPreset): Promise<void> {
    setError('')
    try {
      await api.formatting.deleteUserPreset(preset.preset_id)
      reload()
      announceChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that preset.')
    }
  }

  return (
    <div>
      <h4 style={headingStyle}>Presets from your documents ({presets.length})</h4>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem' }}>
        Upload a document that is already in your format. Its page size, margins, body text, headings and outline
        become a preset you can use on any document. Save it as a file to share it, for example with a class.
      </p>

      {presets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
          {presets.map((preset) => (
            <div
              key={preset.preset_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--background)',
                padding: '0.375rem 0.5rem',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={preset.description}>
                {preset.name}
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                {preset.blueprint?.baseFontSize} · {preset.blueprint?.fontFamily.split(',')[0].replace(/['"]/g, '')}
              </span>
              <button type="button" onClick={() => downloadPreset(preset)} aria-label={`Save ${preset.name} as a file to share`} title="Save as a file to share" style={iconButtonStyle}>
                <Download style={{ width: '13px', height: '13px' }} />
              </button>
              <button type="button" onClick={() => void remove(preset)} aria-label={`Delete ${preset.name}`} title="Delete" style={iconButtonStyle}>
                <Trash2 style={{ width: '12px', height: '12px' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" style={buttonStyle} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy === 'file' ? <Loader2 className="animate-spin" style={{ width: '13px', height: '13px' }} /> : <FileUp style={{ width: '13px', height: '13px' }} />}
          {busy === 'file' ? 'Reading the document…' : 'Make a preset from a document'}
        </button>
        <button type="button" style={buttonStyle} disabled={busy !== null} onClick={() => importInput.current?.click()}>
          {busy === 'import' ? <Loader2 className="animate-spin" style={{ width: '13px', height: '13px' }} /> : <Upload style={{ width: '13px', height: '13px' }} />}
          Add a shared preset
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void makeFromFile(file)
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept={`${PRESET_EXTENSION},application/json`}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importShared(file)
        }}
      />
      {notice && <p role="status" style={{ fontSize: '0.75rem', color: 'var(--success, #059669)', margin: '0.5rem 0 0' }}>{notice}</p>}
      {error && <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--destructive, #dc2626)', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  )
}
