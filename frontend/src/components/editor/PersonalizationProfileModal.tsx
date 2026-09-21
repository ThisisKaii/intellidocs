import { useRef, useState, type ChangeEvent } from 'react'
import {
  X,
  Download,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  UserCog,
} from 'lucide-react'
import { api, type IdocProfile, type ProfileScope, type ProfileImportResult } from '@/services/api'

interface PersonalizationProfileModalProps {
  open: boolean
  onClose: () => void
}

const SCOPE_OPTIONS: { value: ProfileScope; label: string; hint: string }[] = [
  {
    value: 'formatting',
    label: 'Formatting preferences',
    hint: 'Custom binding rules (learned formatting behavior)',
  },
  {
    value: 'grammar',
    label: 'Grammar & custom dictionary',
    hint: 'Approved words and ignored patterns',
  },
  {
    value: 'both',
    label: 'Full profile (both)',
    hint: 'Everything in one portable file',
  },
]

/** Parse and validate the scope field of an unknown .idocprofile object. */
function parseScope(value: unknown): ProfileScope | null {
  if (value === 'formatting' || value === 'grammar' || value === 'both') return value
  return null
}

/** Return a human description of an export scope. */
function scopeLabel(scope: ProfileScope): string {
  return SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope
}

/**
 * Modal dialog to export the current user's personalization profile as a
 * portable .idocprofile file, or import/merge a profile someone shared.
 */
export default function PersonalizationProfileModal({
  open,
  onClose,
}: PersonalizationProfileModalProps): JSX.Element | null {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<ProfileScope>('both')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ name: string; parsed: IdocProfile } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ProfileImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const busy = exporting || importing

  /** Download the current profile as a portable .idocprofile file. */
  async function handleExport(): Promise<void> {
    setExporting(true)
    setError(null)
    setExportMessage(null)
    try {
      const bundle = await api.profile.export(scope)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'intellidocs-profile.idocprofile'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      const bindingCount = bundle.formatting?.custom_bindings?.length ?? 0
      const wordCount = bundle.grammar_spelling?.custom_dictionary?.length ?? 0
      setExportMessage(
        `Exported ${scopeLabel(scope)} (${bindingCount} binding rule${bindingCount === 1 ? '' : 's'}, ` +
          `${wordCount} custom word${wordCount === 1 ? '' : 's'}).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile export failed')
    } finally {
      setExporting(false)
    }
  }

  /** Parse a chosen .idocprofile file and stage it for preview. */
  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Not a valid .idocprofile file (expected a JSON object).')
        }
        const candidate = parsed as Partial<IdocProfile>
        if (typeof candidate.version !== 'string' || !parseScope(candidate.scope)) {
          throw new Error('Not a valid .idocprofile file (missing version or scope).')
        }
        setSelectedFile({ name: file.name, parsed: candidate as IdocProfile })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the profile file.')
        setSelectedFile(null)
      }
    }
    reader.readAsText(file)
  }

  /** Merge the staged profile into the current user's profile. */
  async function handleImport(): Promise<void> {
    if (!selectedFile) return
    setImporting(true)
    setError(null)
    setImportResult(null)
    try {
      const result = await api.profile.import(selectedFile.parsed)
      setImportResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile import failed')
    } finally {
      setImporting(false)
    }
  }

  const previewBindings = selectedFile?.parsed.formatting?.custom_bindings ?? []
  const previewDictionary = selectedFile?.parsed.grammar_spelling?.custom_dictionary ?? []
  const previewPatterns = selectedFile?.parsed.grammar_spelling?.ignored_patterns ?? []

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Personalization profile dialog"
        onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: '1rem',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: '0 0 0.125rem', color: 'var(--foreground)' }}>
                Personalization Profile
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                Share or restore your formatting personality (.idocprofile)
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* ── Export ── */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                <Download style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)' }} />
                Export Personalization Profile
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.625rem' }}>
                {SCOPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: scope === option.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: scope === option.value ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--background)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="profile-scope"
                      value={option.value}
                      checked={scope === option.value}
                      onChange={() => setScope(option.value)}
                      disabled={busy}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{option.label}</span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() => { void handleExport() }}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem',
                  width: '100%',
                  height: '34px',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {exporting ? <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" /> : <Download style={{ width: '14px', height: '14px' }} />}
                {exporting ? 'Exporting…' : 'Export & download'}
              </button>

              {exportMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--success)' }}>
                  <CheckCircle2 style={{ width: '14px', height: '14px' }} />
                  {exportMessage}
                </div>
              )}
            </div>

            {/* ── Import ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                <Upload style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)' }} />
                Import Personalization Profile
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".idocprofile,.json,application/json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <div
                onClick={() => { if (!busy) fileInputRef.current?.click() }}
                style={{
                  border: `2px dashed ${selectedFile ? 'var(--success)' : 'var(--border)'}`,
                  borderRadius: '0.75rem',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  backgroundColor: selectedFile ? 'color-mix(in srgb, var(--success) 4%, transparent)' : 'var(--background)',
                }}
              >
                {selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                    <FileText style={{ width: '24px', height: '24px', color: 'var(--success)' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{selectedFile.name}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>click to choose a different file</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                    <UserCog style={{ width: '24px', height: '24px', color: 'var(--muted-foreground)' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
                      Click to choose a .idocprofile file
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                      Shared by a teammate or professor
                    </span>
                  </div>
                )}
              </div>

              {selectedFile && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>
                      Preview
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                      {scopeLabel(selectedFile.parsed.scope)}
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--foreground)' }}>
                    <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Custom binding rules</span>
                      <span style={{ fontWeight: 600 }}>{previewBindings.length}</span>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Custom words</span>
                      <span style={{ fontWeight: 600 }}>{previewDictionary.length}</span>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Ignored patterns</span>
                      <span style={{ fontWeight: 600 }}>{previewPatterns.length}</span>
                    </li>
                    {selectedFile.parsed.creator_email && (
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Creator</span>
                        <span style={{ fontWeight: 600 }}>{selectedFile.parsed.creator_email}</span>
                      </li>
                    )}
                  </ul>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                    Importing merges with your existing profile — nothing is removed.
                  </p>
                </div>
              )}

              {selectedFile && (
                <button
                  type="button"
                  onClick={() => { void handleImport() }}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.375rem',
                    width: '100%',
                    height: '34px',
                    marginTop: '0.75rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {importing ? <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" /> : <Upload style={{ width: '14px', height: '14px' }} />}
                  {importing ? 'Importing…' : 'Import & merge'}
                </button>
              )}

              {importResult && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem', marginTop: '0.625rem', fontSize: '0.75rem', color: 'var(--success)' }}>
                  <CheckCircle2 style={{ width: '14px', height: '14px', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Imported — {importResult.added_bindings} binding rule{importResult.added_bindings === 1 ? '' : 's'} added,{' '}
                    {importResult.added_words} custom word{importResult.added_words === 1 ? '' : 's'},{' '}
                    {importResult.added_patterns} ignored pattern{importResult.added_patterns === 1 ? '' : 's'}. ({importResult.skipped_bindings} already present skipped.)
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--error)' }}>
                <AlertCircle style={{ width: '14px', height: '14px', flexShrink: 0, marginTop: '1px' }} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}