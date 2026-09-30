import { useEffect, useRef, useState } from 'react'
import { FolderIcon, GraduationCap, Loader2, X } from 'lucide-react'
import type { FolderType } from '@/services/api'

interface FolderCreateModalProps {
  /** Called when the modal closes without creating anything. */
  onClose: () => void
  /** Called with the chosen name and course details once the form is submitted. */
  onSubmit: (input: { name: string; folderType: FolderType; classCode?: string; academicTerm?: string }) => void
  /** True while the parent is awaiting the create request. */
  submitting?: boolean
  /** Server-side error to surface inside the modal. */
  error?: string
}

/** Course codes look like CS-201 or BIO 340. */
const CLASS_CODE_PATTERN = /^[A-Za-z]{2,6}[\s-]?\d{2,4}[A-Za-z]?$/

/**
 * Modal for creating a folder. A professor picks between a private personal
 * workspace and a student class folder; the class folder additionally
 * collects the course code and term shown on its badge.
 */
export default function FolderCreateModal({
  onClose,
  onSubmit,
  submitting = false,
  error,
}: FolderCreateModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [folderType, setFolderType] = useState<FolderType>('personal')
  const [classCode, setClassCode] = useState('')
  const [academicTerm, setAcademicTerm] = useState('')
  const [localError, setLocalError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  /** Validate the form before handing it to the parent. */
  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (submitting) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setLocalError('Give the folder a name')
      return
    }

    const trimmedCode = classCode.trim()
    if (folderType === 'class' && !CLASS_CODE_PATTERN.test(trimmedCode)) {
      setLocalError('Class code must look like CS-201')
      return
    }

    setLocalError('')
    onSubmit({
      name: trimmedName,
      folderType,
      classCode: folderType === 'class' ? trimmedCode : undefined,
      academicTerm: folderType === 'class' ? academicTerm.trim() || undefined : undefined,
    })
  }

  const shownError = localError || error

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New folder"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '28rem',
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          padding: '1.5rem',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>New Folder</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
              Keep a private workspace, or open a folder to your students.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: submitting ? 'default' : 'pointer',
              padding: '0.25rem',
              borderRadius: '0.375rem',
              display: 'flex',
            }}
          >
            <X className="size-4" />
          </button>
        </div>

        <label
          htmlFor="folder-name"
          style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
        >
          Folder name
        </label>
        <input
          id="folder-name"
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setLocalError('')
          }}
          placeholder={folderType === 'class' ? 'Thesis Supervision 2026' : 'Chapter Drafts'}
          maxLength={120}
          style={{
            width: '100%',
            height: '2.5rem',
            padding: '0 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <fieldset style={{ border: 'none', padding: 0, margin: '1.25rem 0 0' }}>
          <legend style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', padding: 0 }}>
            Folder type
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
            <TypeOption
              active={folderType === 'personal'}
              onClick={() => {
                setFolderType('personal')
                setLocalError('')
              }}
              icon={<FolderIcon className="size-4" />}
              title="Personal Workspace"
              description="Only you can see and open it"
            />
            <TypeOption
              active={folderType === 'class'}
              onClick={() => {
                setFolderType('class')
                setLocalError('')
              }}
              icon={<GraduationCap className="size-4" />}
              title="Student Class Folder"
              description="Share with students and collect submissions"
            />
          </div>
        </fieldset>

        {folderType === 'class' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <label
                htmlFor="folder-class-code"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
              >
                Class code
              </label>
              <input
                id="folder-class-code"
                value={classCode}
                onChange={(e) => {
                  setClassCode(e.target.value)
                  setLocalError('')
                }}
                placeholder="CS-201"
                maxLength={24}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                htmlFor="folder-term"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}
              >
                Term <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>(optional)</span>
              </label>
              <input
                id="folder-term"
                value={academicTerm}
                onChange={(e) => setAcademicTerm(e.target.value)}
                placeholder="2026-T1"
                maxLength={32}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {shownError && (
          <p role="alert" style={{ margin: '0.875rem 0 0', fontSize: '0.8125rem', color: 'var(--error)' }}>
            {shownError}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              height: '2.25rem',
              padding: '0 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: submitting ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              height: '2.25rem',
              padding: '0 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'inherit',
            }}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '2.5rem',
  padding: '0 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

interface TypeOptionProps {
  active: boolean
  onClick: () => void
  icon: JSX.Element
  title: string
  description: string
}

/** One selectable folder-type card in the modal's type toggle. */
function TypeOption({ active, onClick, icon, title, description }: TypeOptionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.25rem',
        padding: '0.75rem',
        borderRadius: '0.625rem',
        border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
        backgroundColor: active ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--foreground)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600 }}>
        {icon}
        {title}
      </span>
      <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', lineHeight: 1.35 }}>
        {description}
      </span>
    </button>
  )
}
