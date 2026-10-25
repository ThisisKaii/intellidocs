import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { Upload, X, FileText, AlertCircle } from 'lucide-react'

interface ImportFileModalProps {
  /** Called when the modal should close (cancelled or after the files were handed off). */
  onClose: () => void
  /** Receives the chosen files; the app-level import queue uploads and converts them in the background. */
  onImport: (files: File[]) => void
}

const ACCEPTED_EXTENSIONS = ['.docx', '.doc', '.txt', '.html', '.htm', '.pdf']
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
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
    return `Unsupported file type "${ext}". Please upload a .docx, .doc, .txt, .html, or .pdf file.`
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
 * The files are handed to the app-level import queue and the dialog closes at
 * once; progress shows in the global toast and survives navigation.
 */
export default function ImportFileModal({ onClose, onImport }: ImportFileModalProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  /** Append newly chosen files to the current selection. */
  function addFiles(files: FileList | File[]): void {
    setError(null)
    const next = filterFiles(files)
    if (next.length === 0) {
      setError('No supported files selected. Please pick .docx, .doc, .txt, .html, or .pdf files.')
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

  /** Hand the batch to the import queue and close; the toast takes over. */
  function handleImport(): void {
    if (selectedFiles.length === 0) return
    onImport(selectedFiles)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import file dialog"
        className="animate-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
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
          className="animate-modal"
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
              <h2 className="font-display" style={{ fontSize: '1.0625rem', fontWeight: 700, margin: '0 0 0.125rem', color: 'var(--foreground)' }}>
                Import Document
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                Supported formats: <strong>.docx</strong>, <strong>.doc</strong>, <strong>.txt</strong>, <strong>.html</strong>, <strong>.pdf</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
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
                cursor: 'pointer',
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
              border: `2px dashed ${dragging ? 'var(--primary)' : selectedFiles.length > 0 ? 'var(--success)' : 'var(--border)'}`,
              borderRadius: '0.75rem',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: dragging
                ? 'color-mix(in srgb, var(--primary) 4%, transparent)'
                : selectedFiles.length > 0
                ? 'color-mix(in srgb, var(--success) 4%, transparent)'
                : 'var(--background)',
              transition: 'border-color 150ms, background-color 150ms',
              marginBottom: '1.25rem',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".docx,.doc,.txt,.html,.htm,.pdf"
              multiple
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />

            {selectedFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                <FileText style={{ width: '32px', height: '32px', color: 'var(--success)' }} />
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
                  .docx &bull; .doc &bull; .txt &bull; .html &bull; .pdf — multiple allowed
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
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
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
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X style={{ width: '13px', height: '13px' }} />
                  </button>
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
              <AlertCircle style={{ width: '15px', height: '15px', color: 'var(--error)', flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--error)', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-ghost h-9 px-4">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedFiles.length === 0}
              className="btn-primary h-9 px-4"
            >
              <Upload style={{ width: '14px', height: '14px' }} />
              Import {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'Document'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
