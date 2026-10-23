import { useMemo, useEffect, type ReactNode } from 'react'
import { List, Table, Image } from 'lucide-react'
import { TOCEntry, DEFAULT_TOC_CONFIG, extractTOCFromHTML, extractTablesFromHTML, extractFiguresFromHTML } from './TableOfContents'

interface TOCPanelProps {
  /** Full document HTML content. */
  content: string
  /** Called when a TOC entry is clicked. */
  onEntryClick?: (entry: TOCEntry) => void
  /** Current configuration. */
  config?: Partial<typeof DEFAULT_TOC_CONFIG>
  /** Page numbers mapped by entry ID (from paginated editor). */
  pageNumbers?: Record<string, number>
  /** Active entry ID for highlighting. */
  activeEntryId?: string | null
  /** Called when active entry changes (e.g., on scroll). */
  onActiveEntryChange?: (entryId: string | null) => void
  /** Title to display. */
  title?: string
}

const initialConfig = { ...DEFAULT_TOC_CONFIG }

export function TOCPanel({
  content,
  onEntryClick,
  config = {},
  pageNumbers = {},
  activeEntryId = null,
  onActiveEntryChange,
  title = 'Table of Contents',
}: TOCPanelProps): ReactNode {
  const fullConfig = { ...initialConfig, ...config }

  const { headings, tables, figures } = useMemo(() => {
    const headings = extractTOCFromHTML(content)
    const tables = fullConfig.includeTables ? extractTablesFromHTML(content) : []
    const figures = fullConfig.includeFigures ? extractFiguresFromHTML(content) : []
    return { headings, tables, figures }
  }, [content, fullConfig.includeTables, fullConfig.includeFigures])

  const allEntries = useMemo(() => {
    const entries: TOCEntry[] = [
      ...headings.map((h) => ({ ...h, pageNumber: pageNumbers[h.id] ?? null })),
      ...tables.map((t) => ({ ...t, pageNumber: pageNumbers[t.id] ?? null })),
      ...figures.map((f) => ({ ...f, pageNumber: pageNumbers[f.id] ?? null })),
    ]
    return entries
  }, [headings, tables, figures, pageNumbers])

  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => e.level <= fullConfig.maxDepth)
  }, [allEntries, fullConfig.maxDepth])

  const hasEntries = filteredEntries.length > 0

  useEffect(() => {
    if (onActiveEntryChange && activeEntryId) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              onActiveEntryChange(entry.target.id)
              break
            }
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
      )

      const elements = document.querySelectorAll('[data-toc-target]')
      elements.forEach((el) => observer.observe(el))

      return () => observer.disconnect()
    }
  }, [onActiveEntryChange, activeEntryId])

  if (!hasEntries) {
    return (
      <div style={emptyStateStyle}>
        <List style={{ width: '32px', height: '32px', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, textAlign: 'center' }}>
          No headings found. Add headings (H1–H3) to generate a table of contents.
        </p>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{title}</span>
      </div>
      <div style={contentStyle}>
        <ul style={listStyle}>
          {filteredEntries.map((entry) => (
            <TOCEntryItem
              key={entry.id}
              entry={entry}
              pageNumber={pageNumbers[entry.id]}
              active={entry.id === activeEntryId}
              showPageNumbers={fullConfig.includePageNumbers}
              showDotLeaders={fullConfig.showDotLeaders}
              onClick={onEntryClick}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

interface TOCEntryItemProps {
  entry: TOCEntry
  pageNumber?: number
  active: boolean
  showPageNumbers: boolean
  showDotLeaders: boolean
  onClick?: (entry: TOCEntry) => void
}

function TOCEntryItem({
  entry,
  pageNumber,
  active,
  showPageNumbers,
  showDotLeaders,
  onClick,
}: TOCEntryItemProps): ReactNode {
  const indent = (entry.level - 1) * 1.5
  const isTable = entry.id.startsWith('lot-')
  const isFigure = entry.id.startsWith('lof-')

  return (
    <li
      id={entry.id}
      data-toc-target={entry.id}
      style={{
        ...itemStyle,
        paddingLeft: `${0.75 + indent}rem`,
        opacity: active ? 1 : 0.85,
        backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
        borderLeft: active ? '3px solid var(--accent-strong)' : 'none',
      }}
      onClick={() => onClick?.(entry)}
    >
      <div style={entryRowStyle}>
        {isTable && <Table style={{ ...iconStyle, color: 'var(--accent-strong)' }} />}
        {isFigure && <Image style={{ ...iconStyle, color: 'var(--info)' }} />}
        <span
          style={{
            ...textStyle,
            fontWeight: entry.level === 1 ? 600 : entry.level === 2 ? 500 : 400,
            fontSize: entry.level === 1 ? '0.875rem' : '0.8125rem',
          }}
        >
          {entry.text}
        </span>
        {showDotLeaders && showPageNumbers && pageNumber != null && (
          <span
            style={{
              ...dotLeaderStyle,
              flex: 1,
              display: 'inline-flex',
              alignItems: 'flex-end',
            }}
            aria-hidden="true"
          />
        )}
        {showPageNumbers && pageNumber != null && (
          <span style={pageNumberStyle}>
            {pageNumber}
          </span>
        )}
        {showPageNumbers && pageNumber == null && (
          <span style={{ ...pageNumberStyle, color: 'var(--muted-foreground)' }}>
            —
          </span>
        )}
      </div>
    </li>
  )
}

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--secondary)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted-foreground)',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0.5rem 0',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const itemStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  cursor: 'pointer',
  transition: 'background-color 120ms, border-color 120ms',
  borderRadius: '0 0.375rem 0.375rem 0',
  position: 'relative',
}

const entryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '0.375rem',
}

const iconStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  flexShrink: 0,
  marginBottom: '1px',
}

const textStyle: React.CSSProperties = {
  flex: 1,
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.4,
}

const dotLeaderStyle: React.CSSProperties = {
  borderBottom: '1px dotted var(--muted-foreground)',
  marginBottom: '2px',
  minWidth: '2rem',
}

const pageNumberStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
  marginLeft: '0.5rem',
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1rem',
  textAlign: 'center',
  color: 'var(--muted-foreground)',
}