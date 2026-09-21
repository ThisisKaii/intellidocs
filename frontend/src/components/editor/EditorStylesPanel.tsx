import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { Check, ChevronDown, GripVertical, Plus, Settings2, Trash2, Wand2, X } from 'lucide-react'
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
 * Editor-side "Styles" tab: a reference and management panel for document
 * styles and academic presets that applies directly to the selection / page.
 * Groups are independently collapsible, show the first five entries before a
 * "more" expander, and support localStorage-backed custom aliases.
 */
export default function EditorStylesPanel({
  editor,
  onApplyStyle,
  onApplyPreset,
  activePreset = null,
}: EditorStylesPanelProps): JSX.Element {
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(loadCustomStyles)
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets)
  const [stylesMore, setStylesMore] = useState<boolean>(false)
  const [presetsMore, setPresetsMore] = useState<boolean>(false)
  const [manageOpen, setManageOpen] = useState<boolean>(false)

  const PREVIEW_COUNT = 5

  const allStyles: StyleEntry[] = [...customStyles, ...STYLE_ITEMS]
  const shownStyles = stylesMore ? allStyles : allStyles.slice(0, PREVIEW_COUNT)
  const extraStyles = Math.max(allStyles.length - shownStyles.length, 0)

  const allPresets: PresetEntry[] = [...customPresets, ...ACADEMIC_PRESETS]
  const shownPresets = presetsMore ? allPresets : allPresets.slice(0, PREVIEW_COUNT)
  const extraPresets = Math.max(allPresets.length - shownPresets.length, 0)

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
      <Section title="Academic Presets" count={allPresets.length}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {shownPresets.map((preset) => {
            const key = presetKeyOf(preset)
            const isActive = activePreset === key
            const isCustom = isCustomPreset(preset)
            return (
              <button
                key={isCustom ? preset.id : preset.key}
                type="button"
                onClick={() => onApplyPreset(key)}
                disabled={!editor}
                draggable={!!editor}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-intellidocs-preset', key)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title={preset.description}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-strong)' : '3px solid transparent',
                  cursor: editor ? 'pointer' : 'not-allowed',
                  opacity: editor ? 1 : 0.5,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <GripVertical style={{ width: '14px', height: '14px', color: 'var(--muted-foreground)', marginTop: '1px', flexShrink: 0 }} />
                <Wand2 style={{ width: '13px', height: '13px', color: 'var(--primary)', marginTop: '1px', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    {preset.name}
                    {isActive && <Check style={{ width: '13px', height: '13px', color: 'var(--primary)' }} />}
                    {isCustom && <CustomBadge label="Custom" />}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                    {preset.description}
                  </span>
                </span>
                {isCustom && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCustomPreset(preset.id)
                    }}
                    aria-label={`Remove ${preset.name}`}
                    style={{ color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.125rem' }}
                  >
                    <Trash2 style={{ width: '12px', height: '12px' }} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <PanelFooter
          extra={extraPresets}
          labels={{ expand: `${extraPresets} more presets`, collapse: 'Show fewer presets' }}
          more={presetsMore}
          onToggleMore={() => setPresetsMore((v) => !v)}
          onOpenManage={() => setManageOpen(true)}
        />
      </Section>

      <Section title="Document Styles" count={allStyles.length}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
          {shownStyles.map((style) => {
            const isCustom = isCustomStyle(style)
            return (
              <button
                key={isCustom ? style.id : style.format}
                type="button"
                onClick={() => onApplyStyle(style.format)}
                disabled={!editor}
                draggable={!!editor}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-intellidocs-style', style.format)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title={style.hint}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.125rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: '1px solid transparent',
                  backgroundColor: 'transparent',
                  cursor: editor ? 'pointer' : 'not-allowed',
                  opacity: editor ? 1 : 0.5,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  <GripVertical style={{ width: '13px', height: '13px', color: 'var(--muted-foreground)', flexShrink: 0 }} />
                  {style.label}
                  {isCustom && <CustomBadge label="Custom" />}
                </span>
                <span style={{ fontSize: '0.65625rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {style.hint}
                </span>
                {isCustom && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCustomStyle(style.id)
                    }}
                    aria-label={`Remove ${style.label}`}
                    style={{ color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.125rem' }}
                  >
                    <Trash2 style={{ width: '12px', height: '12px' }} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <PanelFooter
          extra={extraStyles}
          labels={{ expand: `${extraStyles} more styles`, collapse: 'Show fewer styles' }}
          more={stylesMore}
          onToggleMore={() => setStylesMore((v) => !v)}
          onOpenManage={() => setManageOpen(true)}
        />
      </Section>

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

/** Non-collapsible panel section with a title and entry count. */
function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}): JSX.Element {
  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          width: '100%',
          padding: '0.375rem 0.5rem',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{title}</span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>{count} available</span>
      </div>
      <div style={{ padding: '0.25rem' }}>{children}</div>
    </section>
  )
}

/** Row of expand/manage controls shown under each section body. */
function PanelFooter({
  extra,
  labels,
  more,
  onToggleMore,
  onOpenManage,
}: {
  extra: number
  labels: { expand: string; collapse: string }
  more: boolean
  onToggleMore: () => void
  onOpenManage: () => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem', padding: '0 0.375rem' }}>
      {extra > 0 && (
        <button
          type="button"
          onClick={onToggleMore}
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
            fontFamily: 'inherit',
            padding: '0.125rem',
          }}
        >
          <ChevronDown style={{ width: '12px', height: '12px', transform: more ? 'rotate(180deg)' : 'none' }} />
          {more ? labels.collapse : labels.expand}
        </button>
      )}
      <button
        type="button"
        onClick={onOpenManage}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--muted-foreground)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: '0.125rem',
        }}
      >
        <Settings2 style={{ width: '12px', height: '12px' }} /> Manage styles &amp; presets
      </button>
    </div>
  )
}

/** Small rounded tag used to flag custom entries. */
function CustomBadge({ label }: { label: string }): JSX.Element {
  return (
    <span
      style={{
        fontSize: '0.5625rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--primary)',
        backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
        borderRadius: '0.25rem',
        padding: '0.0625rem 0.375rem',
      }}
    >
      {label}
    </span>
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

  return (
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
    </div>
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