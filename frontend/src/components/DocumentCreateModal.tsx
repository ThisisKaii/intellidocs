import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileText, GraduationCap, Loader2, X } from 'lucide-react'
import {
  DOCUMENT_BLUEPRINTS,
  getBlueprint,
  type DocumentBlueprint,
} from './editor/documentBlueprints'
import type { UserPreset } from '@/services/api'

interface DocumentCreateModalProps {
  /** Close without creating anything. */
  onClose: () => void
  /** Called once the user confirms a blueprint and a title. */
  onSubmit: (input: {
    title: string
    blueprint: DocumentBlueprint
    /** Preset key to bind, or null to leave the document unstyled. */
    presetKey: string | null
  }) => void
  /** Titles already in use, used to suggest a non-colliding default. */
  existingTitles: string[]
  /** The user's own forked blueprint versions, offered alongside the standards. */
  userPresets: UserPreset[]
  /** True while the parent is awaiting the create request. */
  submitting?: boolean
  /** Server-side error to surface inside the modal. */
  error?: string
}

/** Derive a title no other document in the folder is already using. */
function uniqueTitle(base: string, existingTitles: string[]): string {
  const taken = new Set(existingTitles.map((title) => title.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base

  let counter = 2
  while (taken.has(`${base} ${counter}`.toLowerCase())) counter += 1
  return `${base} ${counter}`
}

/** Nudge a standard title toward the chosen blueprint, e.g. "Untitled APA Paper". */
function titleForBlueprint(blueprint: DocumentBlueprint, base: string): string {
  if (blueprint.key === 'blank') return base
  return `Untitled ${blueprint.name} document`
}

/**
 * Step one of document creation: pick the starting blueprint. A standard
 * blueprint seeds the structural sections of the paper; a forked user version
 * seeds the same structure with the user's own formatting rules. The title and
 * the choice are handed back to the parent, which performs the create.
 */
export default function DocumentCreateModal({
  onClose,
  onSubmit,
  existingTitles,
  userPresets,
  submitting = false,
  error,
}: DocumentCreateModalProps): JSX.Element {
  const [blueprintKey, setBlueprintKey] = useState<string>(DOCUMENT_BLUEPRINTS[0].key)
  /**
   * Preset key bound to the new document. A standard blueprint binds its own
   * key; a user fork binds the fork's key so the document loads the user's
   * rules rather than the shared standard ones.
   */
  const [presetKey, setPresetKey] = useState<string | null>(
    DOCUMENT_BLUEPRINTS[0].presetKey
  )
  const [title, setTitle] = useState<string>(() =>
    uniqueTitle(titleForBlueprint(DOCUMENT_BLUEPRINTS[0], 'Untitled document'), existingTitles)
  )
  const [localError, setLocalError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  /** Track whether the user has edited the title, so preset switches do not clobber it. */
  const titleTouched = useRef(false)

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  /** Switch blueprint, retitling the document only if the user has not. */
  function selectBlueprint(blueprint: DocumentBlueprint): void {
    setBlueprintKey(blueprint.key)
    setPresetKey(blueprint.presetKey)
    if (!titleTouched.current) {
      setTitle(uniqueTitle(titleForBlueprint(blueprint, 'Untitled document'), existingTitles))
    }
  }

  /**
   * Pick one of the user's forks. The structure comes from the base blueprint
   * it was forked from, but the document binds the fork's own key.
   */
  function selectUserPreset(preset: UserPreset): void {
    setBlueprintKey(preset.base_key)
    setPresetKey(preset.key)
    if (!titleTouched.current) {
      setTitle(uniqueTitle(`Untitled ${preset.name} document`, existingTitles))
    }
  }

  /** Validate the title and hand the choice to the parent. */
  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setLocalError('Give your document a title')
      return
    }
    if (trimmed.length > 200) {
      setLocalError('Title must be 200 characters or fewer')
      return
    }
    setLocalError('')
    onSubmit({
      title: trimmed,
      blueprint: getBlueprint(blueprintKey),
      presetKey,
    })
  }

  const message = localError || error

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-create-title"
        style={{
          width: '100%',
          maxWidth: '38rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '0.875rem',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--card)',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
        }}
      >
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1.25rem 1.5rem 0.75rem',
            }}
          >
            <div>
              <h2
                id="document-create-title"
                style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  fontWeight: 650,
                  color: 'var(--foreground)',
                }}
              >
                New Document
              </h2>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8125rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                Choose a starting template. You can change the preset at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
              style={{
                width: '2rem',
                height: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
              gap: '0.625rem',
              padding: '0.75rem 1.5rem',
            }}
          >
            {DOCUMENT_BLUEPRINTS.map((blueprint) => (
              <BlueprintCard
                key={blueprint.key}
                blueprint={blueprint}
                active={blueprint.key === blueprintKey}
                onClick={() => selectBlueprint(blueprint)}
              />
            ))}
          </div>

          {userPresets.length > 0 && (
            <div style={{ padding: '0 1.5rem 0.75rem' }}>
              <p
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                }}
              >
                Your versions
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                  gap: '0.625rem',
                }}
              >
                {userPresets.map((preset) => (
                  <UserPresetCard
                    key={preset.preset_id}
                    preset={preset}
                    active={preset.key === presetKey}
                    onClick={() => selectUserPreset(preset)}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '0.25rem 1.5rem 1.25rem' }}>
            <label
              htmlFor="document-create-name"
              style={{
                display: 'block',
                marginBottom: '0.375rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              Document title
            </label>
            <input
              id="document-create-name"
              ref={titleRef}
              value={title}
              maxLength={200}
              disabled={submitting}
              onChange={(event) => {
                titleTouched.current = true
                setTitle(event.target.value)
              }}
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

            {message && (
              <p
                role="alert"
                style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--destructive)' }}
              >
                {message}
              </p>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              padding: '0 1.5rem 1.25rem',
            }}
          >
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
                fontWeight: 600,
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
              {submitting ? 'Creating…' : 'Create document'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

interface BlueprintCardProps {
  blueprint: DocumentBlueprint
  active: boolean
  onClick: () => void
}

/** One selectable standard blueprint in the picker grid. */
function BlueprintCard({ blueprint, active, onClick }: BlueprintCardProps): JSX.Element {
  const Icon = blueprint.key === 'uclm_capstone' ? GraduationCap : FileText

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.3rem',
        padding: '0.75rem',
        borderRadius: '0.625rem',
        border: `1px solid ${active ? 'var(--accent-strong)' : 'var(--border)'}`,
        backgroundColor: active
          ? 'color-mix(in srgb, var(--accent-strong) 8%, transparent)'
          : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      {active && (
        <Check
          className="size-3.5"
          style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', color: 'var(--accent-strong)' }}
        />
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <Icon className="size-4" style={{ color: 'var(--accent-strong)' }} />
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
          {blueprint.name}
        </span>
      </span>
      <span style={{ fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
        {blueprint.description}
      </span>
    </button>
  )
}

interface UserPresetCardProps {
  preset: UserPreset
  active: boolean
  onClick: () => void
}

/**
 * One of the current user's forked blueprint versions. Selecting it applies the
 * base blueprint's structure and records the fork key on the new document.
 */
function UserPresetCard({ preset, active, onClick }: UserPresetCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Applies ${preset.base_key} structure with your own rules`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.3rem',
        padding: '0.75rem',
        borderRadius: '0.625rem',
        border: `1px dashed ${active ? 'var(--accent-strong)' : 'var(--border)'}`,
        backgroundColor: active
          ? 'color-mix(in srgb, var(--accent-strong) 8%, transparent)'
          : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      {active && (
        <Check
          className="size-3.5"
          style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', color: 'var(--accent-strong)' }}
        />
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <FileText className="size-4" style={{ color: 'var(--accent-strong)' }} />
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
          {preset.name}
        </span>
      </span>
      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
        Custom v{preset.version} · from {preset.base_key}
      </span>
    </button>
  )
}
