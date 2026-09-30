interface LogoMarkProps {
  /** Rendered width and height in pixels. The mark scales from a 64px grid. */
  size?: number
  /** Accessible label. Pass null to mark the mark decorative next to a wordmark. */
  title?: string | null
  /** Extra class names for layout. */
  className?: string
  /**
   * Spark colour. Defaults to the themed accent. Override on screens whose
   * background is a hard-coded gradient rather than the app theme, so the mark
   * cannot end up light-on-light in dark mode.
   */
  spark?: string
  /** Letterform colour. Defaults to the themed foreground. */
  ink?: string
}

/**
 * The IntelliDocs mark: a serif "i" and "d" fused into one glyph, crowned by a
 * spark. Concept 4, "Focus Beacon".
 *
 * Colours default to the app theme rather than being hard-coded, so the mark
 * follows light/dark mode without a second asset. The spark uses --primary and
 * the letterforms use --foreground, matching how the rest of the chrome is
 * themed.
 */
export function LogoMark({
  size = 32,
  title = null,
  className = '',
  spark = 'var(--primary)',
  ink = 'var(--foreground)',
}: LogoMarkProps): JSX.Element {
  const labelled = title !== null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={title ?? undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {labelled ? <title>{title}</title> : null}
      <path
        d="M32 3 V9 M21 7.5 L25.2 11.7 M43 7.5 L38.8 11.7"
        stroke={spark}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="32" cy="20" r="6" fill={spark} />
      <path d="M29 30 H35 V54 H29 Z" fill={ink} />
      <path
        d="M35 33 H43 A10.5 10.5 0 0 1 43 54 H35"
        stroke={ink}
        strokeWidth="5.5"
        fill="none"
      />
      <path
        d="M23 57 H49"
        stroke={ink}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

interface LogoLockupProps {
  /** Rendered height of the mark in pixels. The wordmark scales to match. */
  size?: number
  /** Hide the wordmark and render the mark alone. */
  markOnly?: boolean
  className?: string
}

/**
 * The mark paired with the "IntelliDocs" wordmark, for navigation bars.
 * The wordmark is real text rather than an outlined path so it stays
 * selectable, translatable, and legible to screen readers.
 */
export function LogoLockup({
  size = 28,
  markOnly = false,
  className = '',
}: LogoLockupProps): JSX.Element {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <LogoMark size={size} />
      {markOnly ? null : (
        <span
          style={{
            fontWeight: 600,
            fontSize: `${Math.round(size * 0.5625)}px`,
            letterSpacing: '-0.32px',
            color: 'var(--foreground)',
          }}
        >
          IntelliDocs
        </span>
      )}
    </span>
  )
}
