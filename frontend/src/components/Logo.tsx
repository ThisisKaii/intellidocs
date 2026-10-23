interface LogoMarkProps {
  /** Rendered width and height in pixels. The mark scales from a 64px grid. */
  size?: number
  /** Accessible label. Pass null to mark the mark decorative next to a wordmark. */
  title?: string | null
  /** Extra class names for layout. */
  className?: string
}

/**
 * The IntelliDocs mark: ragged text lines snapping into neat, aligned ones on a
 * cobalt tile, with a gold accent dot. The tile is part of the mark, so it reads
 * on any background.
 */
export function LogoMark({ size = 32, title = null, className = '' }: LogoMarkProps): JSX.Element {
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
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1351AA" />
      <rect x="16" y="18" width="20" height="5" rx="2.5" fill="#fff" opacity="0.45" />
      <rect x="22" y="27" width="26" height="5" rx="2.5" fill="#fff" opacity="0.7" />
      <rect x="16" y="36" width="32" height="5" rx="2.5" fill="#fff" />
      <rect x="16" y="45" width="32" height="5" rx="2.5" fill="#fff" />
      <circle cx="46" cy="20" r="3.5" fill="#F5B83D" />
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

/** The mark paired with the "IntelliDocs" wordmark (real text, so it stays selectable and accessible). */
export function LogoLockup({ size = 28, markOnly = false, className = '' }: LogoLockupProps): JSX.Element {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <LogoMark size={size} />
      {markOnly ? null : (
        <span
          style={{
            fontWeight: 600,
            fontSize: `${Math.round(size * 0.58)}px`,
            letterSpacing: '-0.3px',
            color: 'var(--foreground)',
          }}
        >
          IntelliDocs
        </span>
      )}
    </span>
  )
}
