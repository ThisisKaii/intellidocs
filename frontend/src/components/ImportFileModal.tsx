import { useRef, useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react'
import { Upload, X, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '../services/api'

interface ImportFileModalProps {
  /** Called when the modal should close (cancelled or after successful import). */
  onClose: () => void
  /** Called with the new document after a successful import. */
  onImported?: () => void
  /** Streams batch import progress so a bottom-right toast can render. */
  onProgress?: (progress: ImportProgress | null) => void
}

export interface ImportProgress {
  done: number
  total: number
  currentName: string
}

const ACCEPTED_EXTENSIONS = ['.docx', '.txt', '.html', '.htm', '.pdf']
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/html',
  'application/pdf',
]

/** Helper to format byte sizes into readable string (KB, MB, GB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Validate a single file; returns an error message or null if acceptable. */
function fileError(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
    return `Unsupported file type "${ext}". Please upload a .docx, .txt, .html, or .pdf file.`
  }
  return null
}

/** Filter an arbitrary file list down to supported files. */
function filterFiles(files: FileList | File[]): File[] {
  const result: File[] = []
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    if (file && !fileError(file)) result.push(file)
  }
  return result
}

/**
 * Modal dialog for importing local files (.docx, .txt, .html, .pdf).
 * Supports multi-file selection and drag-and-drop without size restrictions.
 * Import progress is streamed via onProgress so a bottom-right toast can show
 * a Google-Drive-style indicator while the batch processes.
 */
export default function ImportFileModal({ onClose, onImported, onProgress }: ImportFileModalProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  /** Append newly chosen files to the current selection. */
  function addFiles(files: FileList | File[]): void {
    setError(null)
    setSuccess(false)
    const next = filterFiles(files)
    if (next.length === 0) {
      setError('No supported files selected. Please pick .docx, .txt, .html, or .pdf files.')
      return
    }
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name))
      return [...prev, ...next.filter((f) => !seen.has(f.name))]
    })
  }

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files
    if (files && files.length > 0) addFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(index: number): void {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleImport(): Promise<void> {
    if (selectedFiles.length === 0) return
    setUploading(true)
    setError(null)
    setSuccess(false)
    setImportedCount(0)

    const total = selectedFiles.length
    onProgress?.({ done: 0, total, currentName: selectedFiles[0].name })
    let done = 0

    try {
      for (const file of selectedFiles) {
        onProgress?.({ done, total, currentName: file.name })
        await api.documents.import(file)
        done += 1
        setImportedCount(done)
        onProgress?.({ done, total, currentName: file.name })
      }
      setSuccess(true)
      onImported?.()
      onProgress?.({ done: total, total, currentName: '' })
      setTimeout(() => {
        onProgress?.(null)
        onClose()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.')
      onProgress?.(null)
    } finally {
      setUploading(false)
    }
  }

  // Clear the global toast when the modal is closed mid-flight.
  useEffect(() => {
    return () => {
      onProgress?.(null)
    }
  }, [onProgress])

  return (
    <>
      {/* Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import file dialog"
        onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose() }}
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
        {/* Modal panel */}
        <div
          style={{
            backgroundColor: 'var(--card)',
            borderRadius: '1rem',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: '0 0 0.125rem', color: 'var(--foreground)' }}>
                Import Document
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                Supported formats: <strong>.docx</strong>, <strong>.txt</strong>, <strong>.html</strong>, <strong>.pdf</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
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
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : selectedFiles.length > 0 ? '#16a34a' : 'var(--border)'}`,
              borderRadius: '0.75rem',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              backgroundColor: dragging
                ? 'rgba(var(--primary-rgb, 59 130 246)/0.04)'
                : selectedFiles.length > 0
                ? 'rgba(34,197,94,0.04)'
                : 'var(--background)',
              transition: 'border-color 150ms, background-color 150ms',
              marginBottom: '1.25rem',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".docx,.txt,.html,.htm,.pdf"
              multiple
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />

            {selectedFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                <FileText style={{ width: '32px', height: '32px', color: '#16a34a' }} />
                <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0, color: 'var(--foreground)' }}>
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  click to add more
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem' }}>
                <Upload style={{ width: '32px', height: '32px', color: dragging ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0, color: 'var(--foreground)' }}>
                  {dragging ? 'Drop files here' : 'Drag & drop or click to browse'}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  .docx &bull; .txt &bull; .html &bull; .pdf — multiple allowed
                </p>
              </div>
            )}
          </div>

          {/* Selected file list */}
          {selectedFiles.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
                maxHeight: '180px',
                overflowY: 'auto',
                marginBottom: '1rem',
                padding: '0.25rem 0.125rem',
              }}
            >
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: 'var(--secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <FileText style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--foreground)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.name}
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  {index < importedCount && !uploading ? (
                    <CheckCircle2 style={{ width: '14px', height: '14px', color: '#16a34a', flexShrink: 0 }} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={uploading}
                      aria-label={`Remove ${file.name}`}
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
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <X style={{ width: '13px', height: '13px' }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1rem',
              }}
            >
              <AlertCircle style={{ width: '15px', height: '15px', color: '#dc2626', flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                marginBottom: '1rem',
              }}
            >
              <CheckCircle2 style={{ width: '15px', height: '15px', color: '#16a34a' }} />
              <p style={{ fontSize: '0.8125rem', color: '#16a34a', margin: 0 }}>
                Imported {importedCount} file{importedCount > 1 ? 's' : ''} successfully.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              style={{
                height: '36px',
                padding: '0 1.125rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--foreground)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void handleImport() }}
              disabled={selectedFiles.length === 0 || uploading || success}
              style={{
                height: '36px',
                padding: '0 1.25rem',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: (selectedFiles.length === 0 || uploading || success) ? 'not-allowed' : 'pointer',
                opacity: (selectedFiles.length === 0 || uploading || success) ? 0.6 : 1,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {uploading ? (
                <>
                  <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 0.7s linear infinite' }} />
                  Importing {importedCount}/{selectedFiles.length}…
                </>
              ) : (
                <>
                  <Upload style={{ width: '14px', height: '14px' }} />
                  Import {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'Document'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

interface ImportProgressToastProps {
  progress: ImportProgress
  onDone: () => void
}

/**
 * Google-Drive-style bottom-right import progress indicator.
 * Shows the active file name, a progress bar, and a "done" summary that
 * auto-dismisses a moment after the batch completes.
 */
export function ImportProgressToast({ progress, onDone }: ImportProgressToastProps): JSX.Element {
  const { done, total, currentName } = progress
  const finished = done >= total && total > 0
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  useEffect(() => {
    if (finished) {
      const timer = setTimeout(onDone, 2500)
      return () => clearTimeout(timer)
    }
  }, [finished, onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 10050,
        width: '280px',
        borderRadius: '0.625rem',
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        padding: '0.75rem 0.875rem',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {finished ? (
          <CheckCircle2 style={{ width: '16px', height: '16px', color: '#16a34a', flexShrink: 0 }} />
        ) : (
          <Loader2 style={{ width: '16px', height: '16px', color: 'var(--primary)', flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
        )}
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {finished ? `${total} file${total > 1 ? 's' : ''} imported` : `Importing ${currentName || 'document'}…`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={{ flex: 1, height: '5px', borderRadius: '999px', backgroundColor: 'var(--secondary)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              borderRadius: '999px',
              backgroundColor: finished ? '#16a34a' : 'var(--primary)',
              transition: 'width 200ms ease',
            }}
          />
        </div>
        <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>
          {percent}%
        </span>
      </div>
      {!finished && (
        <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0.375rem 0 0' }}>
          {done} of {total} complete
        </p>
      )}
    </div>
  )
}
