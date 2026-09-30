import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Check, GraduationCap, Pencil, Plus, Trash2, X } from 'lucide-react'
import { STYLE_ITEMS, type StyleItem } from './styleCommands'
import { ACADEMIC_PRESETS, type AcademicPreset } from './academicPresets'

/** A user-created style alias stored in localStorage and bound to a built-in format. */
interface CustomStyle extends StyleItem {
  id: string
}

/** A user-created preset alias stored in localStorage, bound to a built-in preset. */
interface CustomPreset {
  id: string
  name: string
  description: string
  baseKey: string
}

type PresetEntry = CustomPreset | AcademicPreset
type StyleEntry = CustomStyle | StyleItem

const CUSTOM_STYLES_KEY = 'intellidocs.customStyles'
const CUSTOM_PRESETS_KEY = 'intellidocs.customPresets'

/** True when the entry is a user-created preset rather than a built-in. */
function isCustomPreset(value: PresetEntry): value is CustomPreset {
  return 'id' in value
}

/** True when the entry is a user-created style rather than a built-in. */
function isCustomStyle(value: StyleEntry): value is CustomStyle {
  return 'id' in value
}

/** Resolve the preset key that an entry actually applies (aliases use their base). */
function presetKeyOf(entry: PresetEntry): string {
  return isCustomPreset(entry) ? entry.baseKey : entry.key
}

/** Load custom styles from localStorage, ignoring corrupted or missing data. */
function loadCustomStyles(): CustomStyle[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STYLES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? (parsed as CustomStyle[]).filter(
          (s): s is CustomStyle => typeof s?.id === 'string' && typeof s?.format === 'string'
        )
      : []
  } catch {
    return []
  }
}

/** Load custom presets from localStorage, ignoring corrupted or missing data. */
function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? (parsed as CustomPreset[]).filter(
          (p): p is CustomPreset =>
            typeof p?.id === 'string' &&
            typeof p?.name === 'string' &&
            typeof p?.baseKey === 'string' &&
            ACADEMIC_PRESETS.some((b) => b.key === p.baseKey)
        )
      : []
  } catch {
    return []
  }
}

interface EditorStylesPanelProps {
  editor: Editor | null
  onApplyStyle: (format: string) => void
  onApplyPreset: (key: string) => void
  activePreset: string | null
}

const inputStyle: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.8125rem',
  height: '2rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  padding: '0 0.5rem',
  outline: 'none',
  boxSizing: 'border-box',
}

/**
 * Editor-side Styles tab: one horizontal nav strip that holds the document
 * styles and the academic presets side by side, plus a "Manage" control that
 * opens a pop-up modal for creating and removing custom aliases.
 */
export default function EditorStylesPanel({
  editor,
  onApplyStyle,
  onApplyPreset,
  activePreset = null,
}: EditorStylesPanelProps): JSX.Element {
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(loadCustomStyles)
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets)
  const [manageOpen, setManageOpen] = useState<boolean>(false)

  // Custom entries lead the strip so the user's own styles/presets come first.
  const allStyles: StyleEntry[] = [...customStyles, ...STYLE_ITEMS]
  const allPresets: PresetEntry[] = [...customPresets, ...ACADEMIC_PRESETS]

  /** Persist a new custom style alias and refresh the list. */
  function addCustomStyle(format: string, label: string, hint: string): void {
    const entry: CustomStyle = { id: `s-${Date.now()}`, format, label: label.trim(), hint: hint.trim() }
    const next = [...customStyles, entry]
    localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(next))
    setCustomStyles(next)
  }

  /** Persist a new custom preset alias and refresh the list. */
  function addCustomPreset(name: string, description: string, baseKey: string): void {
    const entry: CustomPreset = { id: `p-${Date.now()}`, name: name.trim(), description: description.trim(), baseKey }
    const next = [...customPresets, entry]
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next))
    setCustomPresets(next)
  }

  /** Remove a custom style alias and persist the remainder. */
  function removeCustomStyle(id: string): void {
    const next = customStyles.filter((s) => s.id !== id)
    localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(next))
    setCustomStyles(next)
  }

  /** Remove a custom preset alias and persist the remainder. */
  function removeCustomPreset(id: string): void {
    const next = customPresets.filter((p) => p.id !== id)
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next))
    setCustomPresets(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '2px 0 6px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          overflowX: 'auto',
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}
      >
        <StripLabel>Styles</StripLabel>
        {allStyles.map((style) => (
          <StripButton
            key={isCustomStyle(style) ? style.id : style.format}
            label={style.label}
            title={style.hint}
            disabled={!editor}
            drag={editor ? { type: 'application/x-intellidocs-style', value: style.format } : undefined}
            onApply={() => onApplyStyle(style.format)}
          />
        ))}

        <StripDivider />

        <StripLabel>Presets</StripLabel>
        {allPresets.map((preset) => {
          const key = presetKeyOf(preset)
          return (
            <StripButton
              key={isCustomPreset(preset) ? preset.id : preset.key}
              label={preset.name}
              title={preset.description}
              icon={<GraduationCap style={{ width: '13px', height: '13px', opacity: 0.7 }} />}
              active={activePreset === key}
              disabled={!editor}
              drag={editor ? { type: 'application/x-intellidocs-preset', value: key } : undefined}
              onApply={() => onApplyPreset(key)}
            />
          )
        })}

        <StripDivider />

        <StripButton
          label="Manage"
          title="Add or remove your own styles and presets"
          icon={<Pencil style={{ width: '13px', height: '13px', opacity: 0.7 }} />}
          onApply={() => setManageOpen(true)}
        />
      </div>

      <ManageStylesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        customStyles={customStyles}
        customPresets={customPresets}
        onAddStyle={addCustomStyle}
        onRemoveStyle={removeCustomStyle}
        onAddPreset={addCustomPreset}
        onRemovePreset={removeCustomPreset}
      />
    </div>
  )
}

/** Uppercase group label shown before a run of strip buttons. */
function StripLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--muted-foreground)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '0 4px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** Thin vertical divider between toolbar groups. */
function StripDivider(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1px',
        height: '18px',
        backgroundColor: 'var(--border)',
        flexShrink: 0,
        margin: '0 2px',
      }}
    />
  )
}

interface StripButtonProps {
  label: string
  title: string
  icon?: ReactNode
  active?: boolean
  disabled?: boolean
  /** When set, the button can be dragged onto the page carrying this payload. */
  drag?: { type: string; value: string }
  onApply: () => void
}

/**
 * One entry in the Styles nav strip. Applies on click, and can be dragged onto
 * the page — the drag payload carries the format or preset key the page needs.
 */
function StripButton({
  label,
  title,
  icon,
  active = false,
  disabled = false,
  drag,
  onApply,
}: StripButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      draggable={!!drag}
      onDragStart={(e) => {
        if (!drag) return
        e.dataTransfer.setData(drag.type, drag.value)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onMouseDown={(e) => {
        // Keep the editor selection alive when the strip button is pressed.
        e.preventDefault()
        onApply()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '30px',
        padding: '0 10px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
        boxShadow: active ? 'inset 0 -2px 0 0 var(--accent-strong)' : 'none',
        color: 'var(--foreground)',
        fontSize: '12px',
        fontWeight: active ? 700 : 500,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
      {label}
      {active && <Check style={{ width: '13px', height: '13px', color: 'var(--primary)' }} />}
    </button>
  )
}

interface ManageStylesModalProps {
  open: boolean
  onClose: () => void
  customStyles: CustomStyle[]
  customPresets: CustomPreset[]
  onAddStyle: (format: string, label: string, hint: string) => void
  onRemoveStyle: (id: string) => void
  onAddPreset: (name: string, description: string, baseKey: string) => void
  onRemovePreset: (id: string) => void
}

/** Pop-up modal for managing (adding / deleting) custom styles and preset aliases. */
function ManageStylesModal({
  open,
  onClose,
  customStyles,
  customPresets,
  onAddStyle,
  onRemoveStyle,
  onAddPreset,
  onRemovePreset,
}: ManageStylesModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          overflowY: 'auto',
          borderRadius: '0.75rem',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          padding: '1.25rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Manage Styles &amp; Presets</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={iconButtonStyle}>
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h4
              style={{
                margin: '0 0 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted-foreground)',
              }}
            >
              Custom Presets ({customPresets.length})
            </h4>
            {customPresets.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem' }}>
                No custom presets yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
                {customPresets.map((p) => (
                  <div
                    key={p.id}
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
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                      based on {p.baseKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemovePreset(p.id)}
                      aria-label={`Remove ${p.name}`}
                      style={iconButtonStyle}
                    >
                      <Trash2 style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <CustomPresetForm onAdd={onAddPreset} />
          </div>

          <div>
            <h4
              style={{
                margin: '0 0 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted-foreground)',
              }}
            >
              Custom Styles ({customStyles.length})
            </h4>
            {customStyles.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem' }}>
                No custom styles yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
                {customStyles.map((s) => (
                  <div
                    key={s.id}
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
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{s.label}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>{s.hint}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveStyle(s.id)}
                      aria-label={`Remove ${s.label}`}
                      style={iconButtonStyle}
                    >
                      <Trash2 style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <CustomStyleForm onAdd={onAddStyle} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface CustomStyleFormProps {
  onAdd: (format: string, label: string, hint: string) => void
}

/** Inline form used to create a custom style alias bound to a built-in format. */
function CustomStyleForm({ onAdd }: CustomStyleFormProps): JSX.Element {
  const [label, setLabel] = useState<string>('')
  const [hint, setHint] = useState<string>('')
  const [format, setFormat] = useState<string>(STYLE_ITEMS[1]?.format ?? 'normal')

  function submit(): void {
    if (!label.trim()) return
    onAdd(format, label, hint)
    setLabel('')
    setHint('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.375rem', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--secondary)' }}>
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (e.g. Subtitle)" style={{ ...inputStyle, flex: 1 }} />
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Hint" style={{ ...inputStyle, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
          {STYLE_ITEMS.map((item) => (
            <option key={item.format} value={item.format}>
              Uses {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!label.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            height: '2rem',
            padding: '0 0.625rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.6875rem',
            fontWeight: 700,
            cursor: label.trim() ? 'pointer' : 'not-allowed',
            opacity: label.trim() ? 1 : 0.5,
            fontFamily: 'inherit',
          }}
        >
          <Plus style={{ width: '12px', height: '12px' }} /> Add
        </button>
      </div>
    </div>
  )
}

interface CustomPresetFormProps {
  onAdd: (name: string, description: string, baseKey: string) => void
}

/** Inline form used to create a custom preset alias bound to a built-in preset. */
function CustomPresetForm({ onAdd }: CustomPresetFormProps): JSX.Element {
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [baseKey, setBaseKey] = useState<string>(ACADEMIC_PRESETS[0]?.key ?? '')

  function submit(): void {
    if (!name.trim() || !baseKey) return
    onAdd(name, description, baseKey)
    setName('')
    setDescription('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.375rem', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--secondary)' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name (e.g. Thesis Draft)" style={inputStyle} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it applies" style={inputStyle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <select value={baseKey} onChange={(e) => setBaseKey(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
          {ACADEMIC_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              Based on {preset.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || !baseKey}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            height: '2rem',
            padding: '0 0.625rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '0.6875rem',
            fontWeight: 700,
            cursor: name.trim() && baseKey ? 'pointer' : 'not-allowed',
            opacity: name.trim() && baseKey ? 1 : 0.5,
            fontFamily: 'inherit',
          }}
        >
          <Plus style={{ width: '12px', height: '12px' }} /> Add
        </button>
      </div>
    </div>
  )
}