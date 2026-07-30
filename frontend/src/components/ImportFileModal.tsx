import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../services/api'

interface ImportFileModalProps {
  /** Called when the modal should close (cancelled or after successful import). */
  onClose: () => void
  /** Called with the new document after a successful import. */
  onImported?: () => void
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

/**
 * Modal dialog for importing local files (.docx, .txt, .html, .pdf).
 * Supports drag-and-drop and file picker without size restrictions.
 */
export default function ImportFileModal({ onClose, onImported }: ImportFileModalProps): JSX.Element {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  /** Validate and store a selected file. */
  function handleFile(file: File): void {
    setError(null)
    setSuccess(false)

    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      setError(`Unsupported file type "${ext}". Please upload a .docx, .txt, .html, or .pdf file.`)
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
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
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      const doc = await api.documents.import(selectedFile)
      setSuccess(true)
      onImported?.()
      setTimeout(() => {
        onClose()
        navigate(`/document/${doc.id}`)
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import file dialog"
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
            border: `2px dashed ${dragging ? 'var(--primary)' : selectedFile ? '#16a34a' : 'var(--border)'}`,
            borderRadius: '0.75rem',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: dragging
              ? 'rgba(var(--primary-rgb, 59 130 246)/0.04)'
              : selectedFile
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
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />

          {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <FileText style={{ width: '32px', height: '32px', color: '#16a34a' }} />
              <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0, color: 'var(--foreground)', wordBreak: 'break-all' }}>
                {selectedFile.name}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                {formatFileSize(selectedFile.size)} &mdash; click to change
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem' }}>
              <Upload style={{ width: '32px', height: '32px', color: dragging ? 'var(--primary)' : 'var(--muted-foreground)' }} />
              <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0, color: 'var(--foreground)' }}>
                {dragging ? 'Drop your file here' : 'Drag & drop or click to browse'}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                .docx &bull; .txt &bull; .html &bull; .pdf
              </p>
            </div>
          )}
        </div>

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
            <p style={{ fontSize: '0.8125rem', color: '#16a34a', margin: 0 }}>Import successful! Opening document…</p>
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
            onClick={handleImport}
            disabled={!selectedFile || uploading || success}
            style={{
              height: '36px',
              padding: '0 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: (!selectedFile || uploading || success) ? 'not-allowed' : 'pointer',
              opacity: (!selectedFile || uploading || success) ? 0.6 : 1,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {uploading ? (
              <>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Importing…
              </>
            ) : (
              <>
                <Upload style={{ width: '14px', height: '14px' }} />
                Import Document
              </>
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
