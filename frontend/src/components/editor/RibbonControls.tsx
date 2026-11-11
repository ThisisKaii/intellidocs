import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export const FOCUS_RING: CSSProperties = { outline: '2px solid var(--ring)', outlineOffset: '1px' }

export interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'title' | 'style'> {
  icon: LucideIcon
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  indicatorColor?: string
  /** Accessible name when it differs from the tooltip. */
  ariaLabel?: string
}

/** A 32px ribbon icon button. Fires on mousedown so the editor keeps its selection. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { icon: Icon, title, active = false, disabled = false, onClick, indicatorColor, ariaLabel, onMouseDown, ...rest },
  ref,
): JSX.Element {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        onMouseDown?.(e)
        if (!disabled) onClick()
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, FOCUS_RING)}
      onBlur={(e) => (e.currentTarget.style.outline = 'none')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: active ? '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' : '1px solid transparent',
        backgroundColor: active ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background-color 150ms, color 150ms',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.backgroundColor = 'var(--secondary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <Icon style={{ width: '14px', height: '14px' }} strokeWidth={active ? 2.25 : 1.75} />
      {indicatorColor && indicatorColor !== 'transparent' && (
        <span
          style={{
            position: 'absolute',
            bottom: '3px',
            width: '12px',
            height: '2px',
            borderRadius: '9999px',
            backgroundColor: indicatorColor,
          }}
        />
      )}
    </button>
  )
})

/** Thin vertical divider between toolbar groups. */
export function Divider(): JSX.Element {
  return (
    <div
      style={{
        width: '1px',
        height: '18px',
        backgroundColor: 'var(--border)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )
}

/** A ribbon group with a small caption underneath, as in Word's Insert tab. */
export function RibbonGroup({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', flexShrink: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>{children}</div>
      <span
        style={{
          fontSize: '9px',
          lineHeight: '10px',
          color: 'var(--muted-foreground)',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}
