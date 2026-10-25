import { useMemo, useEffect, useRef, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { PanelLeftClose, FileText, Heading1, Heading2, Heading3, ListTree } from 'lucide-react'
import { TOCEntry, extractTOCFromHTML } from './TableOfContents'
import { groupRepeatedHeadings, nextOccurrence } from '@/lib/outlineGroups'

interface OutlineNavigatorProps {
  /** Full document HTML content. */
  content: string
  /** Editor instance for scrolling to headings. */
  editor: Editor | null
  /** Called when a heading is clicked. */
  onHeadingClick?: (entry: TOCEntry, occurrence: number) => void
  /** Current active heading ID (for highlighting). */
  activeHeadingId?: string | null
  /** Called when active heading changes (on scroll). */
  onActiveHeadingChange?: (headingId: string | null) => void
  /** Maximum heading depth to show (1-3). */
  maxDepth?: 1 | 2 | 3
  /** Whether the panel is collapsed. */
  collapsed?: boolean
  /** Called when collapse state changes. */
  onCollapseChange?: (collapsed: boolean) => void
  /** Called when the user clicks close. */
  onClose?: () => void
}

const ICONS = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
}

export function OutlineNavigator({
  content,
  editor,
  onHeadingClick,
  activeHeadingId = null,
  onActiveHeadingChange,
  maxDepth = 3,
  collapsed = false,
  onCollapseChange,
  onClose,
}: OutlineNavigatorProps): ReactNode {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const headingElementsRef = useRef<Map<string, HTMLElement>>(new Map())

  const headings = useMemo(() => {
    const entries = extractTOCFromHTML(content)
    return entries.filter((e) => e.level <= maxDepth)
  }, [content, maxDepth])

  const hasHeadings = headings.length > 0
  const groups = useMemo(() => groupRepeatedHeadings(headings), [headings])
  // Which occurrence of a repeated heading the last click went to, by outline key.
  const lastOccurrence = useRef<Map<string, number>>(new Map())

  // Set up IntersectionObserver to track visible headings
  useEffect(() => {
    if (!onActiveHeadingChange || !editor || editor.isDestroyed) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        let topMost: { id: string; top: number } | null = null
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.target.getBoundingClientRect()
            const id = (entry.target as HTMLElement).dataset.outlineKey
            if (!id) continue
            if (!topMost || rect.top < topMost.top) {
              topMost = { id, top: rect.top }
            }
          }
        }
        if (topMost) {
          onActiveHeadingChange(topMost.id)
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: [0, 0.1, 0.5] }
    )

    // Observe heading elements in the editor
    const view = editor.view
    if (view) {
      const doc = view.dom
      const headingsInDoc = doc.querySelectorAll('h1, h2, h3')
      headingsInDoc.forEach((el: Element) => {
        // The editor DOM carries no heading IDs, so map each rendered heading
        // element back to its outline entry by text + level.
        const level = Number(el.tagName.substring(1))
        const text = el.textContent?.trim() ?? ''
        const match = headings.find((h) => h.level === level && h.text.trim() === text)
        if (!match) return
        ;(el as HTMLElement).dataset.outlineKey = match.id
        headingElementsRef.current.set(match.id, el as HTMLElement)
        observerRef.current?.observe(el)
      })
    }

    return () => {
      observerRef.current?.disconnect()
      headingElementsRef.current.clear()
    }
  }, [editor, onActiveHeadingChange, headings])

  // Clicking an outline entry reports the target; the host page performs the
  // jump and draws the confirmation flash. Jumping stays out of this component
  // because ProseMirror re-renders heading DOM on the selection transaction,
  // which would destroy any flash class attached here.
  const handleHeadingClick = (e: React.MouseEvent, entry: TOCEntry, count: number): void => {
    e.preventDefault()
    e.stopPropagation()
    const key = `${entry.level}|${entry.text.trim().toLowerCase()}`
    const occurrence = nextOccurrence(lastOccurrence.current.get(key), count)
    lastOccurrence.current.set(key, occurrence)
    onHeadingClick?.(entry, occurrence)
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={headerTopStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListTree style={{ width: '15px', height: '15px', color: 'var(--primary)' }} />
            <span style={titleStyle}>Outline</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onClose) {
                onClose()
              } else if (onCollapseChange) {
                onCollapseChange(!collapsed)
              }
            }}
            style={collapseButtonStyle}
            title="Close outline"
            aria-label="Close outline"
          >
            <PanelLeftClose style={chevronStyle} />
          </button>
        </div>
        <span style={countStyle}>
          {hasHeadings ? `${headings.length} heading${headings.length !== 1 ? 's' : ''}` : 'No headings yet'}
        </span>
      </div>

      {!collapsed && (
        <div style={contentStyle}>
          {hasHeadings ? (
            <ul style={listStyle}>
              {groups.map(({ entry, count }) => (
                <OutlineEntryItem
                  key={entry.id}
                  entry={{ ...entry, pageNumber: null }}
                  count={count}
                  active={entry.id === activeHeadingId}
                  onClick={handleHeadingClick}
                />
              ))}
            </ul>
          ) : (
            <div style={emptyStateStyle}>
              <FileText style={{ width: '28px', height: '28px', color: 'var(--muted-foreground)', marginBottom: '0.5rem', opacity: 0.6 }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                Add H1–H3 headings to see the document outline.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface OutlineEntryItemProps {
  entry: TOCEntry
  active: boolean
  /** How many headings share this row's text and level. */
  count: number
  onClick: (e: React.MouseEvent, entry: TOCEntry, count: number) => void
}

function OutlineEntryItem({ entry, active, count, onClick }: OutlineEntryItemProps): ReactNode {
  const indent = (entry.level - 1) * 0.75
  const Icon = ICONS[entry.level as 1 | 2 | 3] || Heading1

  return (
    <li
      style={{
        ...itemStyle,
        paddingLeft: `${0.5 + indent}rem`,
        // Inline background only when active — a transparent inline value
        // would override the stylesheet's hover surface.
        ...(active ? { backgroundColor: 'var(--accent-subtle)' } : {}),
        borderLeft: active ? '2px solid var(--accent-strong)' : 'none',
      }}
      onClick={(e) => onClick(e, entry, count)}
    >
      <div style={entryRowStyle}>
        <Icon style={{ ...iconStyle, color: active ? 'var(--accent-strong)' : 'var(--muted-foreground)' }} />
        <span
          style={{
            ...textStyle,
            fontWeight: entry.level === 1 ? 600 : entry.level === 2 ? 500 : 400,
            fontSize: entry.level === 1 ? '0.8125rem' : '0.75rem',
            color: active ? 'var(--foreground)' : 'var(--text-secondary)',
          }}
        >
          {entry.text}
        </span>
        {count > 1 && <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>×{count}</span>}
      </div>
    </li>
  )
}

/**
 * Locate a heading node matching the outline entry's text and level. The
 * editor DOM has no heading IDs, so position lookup is content-based. When no
 * heading matches (structural sections imported as bold paragraphs, e.g.
 * APPROVAL SHEET), the first paragraph with identical text is used instead.
 * Exported for the host page's coordinate-based jump handler.
 */
export function findHeadingPosition(editor: Editor | null, text: string, level: number, occurrence = 0): number | null {
  if (!editor || editor.isDestroyed) return null
  const doc = editor.state.doc
  let foundPos: number | null = null
  let paragraphFallback: number | null = null
  const target = text.trim()
  // Repeated headings (the same title on every annex page): take the n-th one.
  let seen = 0

  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (foundPos !== null) return false
    if (node.textContent.trim().toLowerCase() !== target.toLowerCase()) return true
    if (node.type.name === 'heading' && node.attrs.level === level) {
      if (seen === occurrence) foundPos = pos
      seen += 1
      return false
    }
    if (paragraphFallback === null && node.type.name === 'paragraph') {
      paragraphFallback = pos
    }
    return true
  })

  // An occurrence past the last heading wraps to the first.
  return foundPos ?? (occurrence > 0 ? findHeadingPosition(editor, text, level, 0) : paragraphFallback)
}

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--card)',
  border: 'none',
  borderRadius: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  width: '100%',
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--secondary)',
}

const headerTopStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted-foreground)',
}

const countStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.625rem',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  backgroundColor: 'var(--card)',
  borderRadius: '9999px',
  padding: '0.0625rem 0.5rem',
  marginTop: '0.375rem',
  fontVariantNumeric: 'tabular-nums',
}

const collapseButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
}

const chevronStyle: React.CSSProperties = {
  width: '15px',
  height: '15px',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0.25rem 0',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const itemStyle: React.CSSProperties = {
  padding: '0.3125rem 0.5rem',
  cursor: 'pointer',
  transition: 'background-color 120ms, border-color 120ms',
  borderRadius: '0 0.375rem 0.375rem 0',
  position: 'relative',
}

const entryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
}

const iconStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  flexShrink: 0,
}

const textStyle: React.CSSProperties = {
  flex: 1,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.4,
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