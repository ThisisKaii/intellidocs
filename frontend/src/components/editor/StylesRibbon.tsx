import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ChevronDown, ChevronRight, Wand2 } from 'lucide-react'
import { STYLE_ITEMS } from './styleCommands'
import { ACADEMIC_PRESETS } from './academicPresets'

interface StylesRibbonProps {
  editor: Editor | null
  onApplyStyle: (format: string) => void
  onApplyPreset: (key: string) => void
  activePreset: string | null
}

/** MIME type used to drag a style tile onto a paragraph in the editor. */
export const STYLE_DRAG_MIME = 'application/intellidocs-style'

/** Horizontal ribbon of one-click styles plus academic preset one-click preset cards. */
export default function StylesRibbon({
  editor,
  onApplyStyle,
  onApplyPreset,
  activePreset,
}: StylesRibbonProps): JSX.Element {
  const [presetsOpen, setPresetsOpen] = useState<boolean>(false)
  const [presetsAnchor, setPresetsAnchor] = useState<{ top: number; left: number } | null>(null)
  const presetButtonRef = useRef<HTMLButtonElement>(null)

  /** Open the dropdown; anchor it to the button's viewport rect so it floats above the editor. */
  function togglePresets(): void {
    if (presetsOpen) {
      setPresetsOpen(false)
      setPresetsAnchor(null)
      return
    }
    const rect = presetButtonRef.current?.getBoundingClientRect()
    setPresetsAnchor(rect ? { top: rect.bottom + 8, left: rect.left } : null)
    setPresetsOpen(true)
  }

  // Close the dropdown when the user clicks anywhere outside it.
  useEffect(() => {
    function onDocMouseDown(event: MouseEvent): void {
      if (!presetsOpen) return
      if (presetButtonRef.current?.contains(event.target as Node)) return
      setPresetsOpen(false)
      setPresetsAnchor(null)
    }
    window.addEventListener('mousedown', onDocMouseDown)
    return () => window.removeEventListener('mousedown', onDocMouseDown)
  }, [presetsOpen])

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.375rem 1rem',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {STYLE_ITEMS.map((item) => (
        <div
          key={item.format}
          draggable={!!editor}
          onDragStart={(e) => {
            e.dataTransfer.setData(STYLE_DRAG_MIME, item.format)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => onApplyStyle(item.format)}
          title={item.hint}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.125rem',
            minWidth: '52px',
            padding: '0.375rem 0.5rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
            cursor: editor ? 'grab' : 'not-allowed',
            userSelect: 'none',
            transition: 'background-color 120ms, opacity 120ms',
            opacity: editor ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {item.label}
          </span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--muted-foreground)' }}>{item.hint}</span>
        </div>
      ))}

      <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border)', margin: '0 0.25rem' }} />

      {/* Presets */}
      <button
        ref={presetButtonRef}
        type="button"
        onClick={togglePresets}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.625rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--border)',
          backgroundColor: activePreset ? 'rgba(99, 102, 241, 0.12)' : 'var(--secondary)',
          color: 'var(--foreground)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}
      >
        <Wand2 style={{ width: '14px', height: '14px' }} />
        {activePreset ? `Preset: ${ACADEMIC_PRESETS.find((p) => p.key === activePreset)?.name ?? activePreset}` : 'Academic presets'}
        {presetsOpen ? <ChevronDown style={{ width: '14px', height: '14px' }} /> : <ChevronRight style={{ width: '14px', height: '14px' }} />}
      </button>

      {presetsOpen && presetsAnchor && (
        <div
          style={{
            position: 'fixed',
            top: presetsAnchor.top,
            left: presetsAnchor.left,
            zIndex: 9990,
            backgroundColor: 'var(--card)',
            boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 8px 24px',
            borderRadius: '0.75rem',
            padding: '0.375rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            minWidth: '320px',
            maxWidth: '90vw',
            whiteSpace: 'normal',
          }}
        >
          {ACADEMIC_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                onApplyPreset(preset.key)
                setPresetsOpen(false)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.25rem',
                padding: '0.5rem 0.625rem',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: activePreset === preset.key ? 'var(--secondary)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
                {preset.name}
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}