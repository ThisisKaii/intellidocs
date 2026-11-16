import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, BookOpen, ChevronRight, Download, FileText, Hash, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'

import type { DocumentTabSummary, TabNumbering } from '@/services/api'

/**
 * The tabs of a document split into tabs (Front matter, Chapter 1 …), like Google Docs' document
 * tabs. Only the open tab is loaded in the editor; the list switches between them and manages them.
 * Purely presentational: the document page does the loading, saving and server calls.
 */

interface TabSidebarProps {
  tabs: DocumentTabSummary[]
  activeTabId: string | null
  /** A tab is being opened or a change is in flight: actions wait. */
  busy: boolean
  readOnly: boolean
  onOpen: (tabId: string) => void
  onRename: (tabId: string, title: string) => void
  onMove: (tabId: string, position: number) => void
  onSetNumbering: (tabId: string, numbering: TabNumbering | null) => void
  onAdd: (afterTabId: string) => void
  onDelete: (tabId: string) => void
  onMergeAll: () => void
  /** "Download this tab…" (opens the download chooser with the tab selected). */
  onDownload?: (tabId: string) => void
  /** Open another tab at one of its headings (from the tab's stored outline). */
  onOpenHeading?: (tabId: string, text: string, level: number) => void
  /** The whole document read-only, one tab under another (on/off). */
  wholeView?: boolean
  onToggleWholeView?: () => void
}

const NUMBERING_CHOICES: Array<{ label: string; value: TabNumbering | null }> = [
  { label: 'Continue from the previous tab', value: null },
  { label: 'Restart at 1 (1, 2, 3)', value: { format: 'arabic', restart: true, start: 1, hideFirst: false } },
  { label: 'Roman numerals, title page unnumbered', value: { format: 'roman', restart: true, start: 1, hideFirst: true } },
  { label: 'Roman numerals (i, ii, iii)', value: { format: 'roman', restart: true, start: 1, hideFirst: false } },
  { label: 'No page numbers', value: { format: 'none', restart: false, start: 1, hideFirst: false } },
]

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.375rem 0.625rem',
  border: 'none',
  background: 'transparent',
  color: 'var(--foreground)',
  fontSize: '0.75rem',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: '0.25rem',
}

const iconStyle: CSSProperties = { width: '13px', height: '13px', flexShrink: 0 }

function sameNumbering(a: TabNumbering | null, b: TabNumbering | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function TabSidebar({
  tabs,
  activeTabId,
  busy,
  readOnly,
  onOpen,
  onRename,
  onMove,
  onSetNumbering,
  onAdd,
  onDelete,
  onMergeAll,
  onDownload,
  wholeView = false,
  onToggleWholeView,
  onOpenHeading,
}: TabSidebarProps): JSX.Element {
  // Tabs whose headings are shown (the open tab's are in the outline below).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [numberingFor, setNumberingFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmMerge, setConfirmMerge] = useState(false)
  const menuRef = useRef<HTMLElement | null>(null)

  // Close an open menu on a click elsewhere or Escape.
  useEffect(() => {
    if (!menuFor && !confirmMerge) return
    const onDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuFor(null)
        setNumberingFor(null)
        setConfirmMerge(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuFor(null)
        setNumberingFor(null)
        setConfirmMerge(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuFor, confirmMerge])

  function startRename(tab: DocumentTabSummary): void {
    setMenuFor(null)
    setRenaming(tab.tab_id)
    setDraftTitle(tab.title)
  }

  function finishRename(tab: DocumentTabSummary): void {
    const title = draftTitle.trim()
    setRenaming(null)
    if (title && title !== tab.title) onRename(tab.tab_id, title)
  }

  return (
    <nav aria-label="Document tabs" style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0.5rem 0.625rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem 0.375rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          Tabs
        </span>
        {onToggleWholeView && (
          <button
            type="button"
            title={wholeView ? 'Back to editing one tab' : 'Read the whole document (read-only)'}
            aria-label={wholeView ? 'Back to editing' : 'Read the whole document'}
            aria-pressed={wholeView}
            disabled={busy}
            onClick={onToggleWholeView}
            style={{ ...menuItemStyle, width: 'auto', padding: '0.25rem', marginLeft: 'auto', color: wholeView ? 'var(--primary)' : 'var(--foreground)' }}
          >
            <BookOpen style={iconStyle} />
          </button>
        )}
        {!readOnly && (
          <div style={{ position: 'relative', display: 'flex', gap: '0.125rem' }} ref={confirmMerge ? (menuRef as React.RefObject<HTMLDivElement>) : undefined}>
            <button
              type="button"
              title="Add a tab after this one"
              aria-label="Add a tab"
              disabled={busy || !activeTabId}
              onClick={() => activeTabId && onAdd(activeTabId)}
              style={{ ...menuItemStyle, width: 'auto', padding: '0.25rem' }}
            >
              <Plus style={iconStyle} />
            </button>
            <button
              type="button"
              title="Merge all tabs back into one document"
              aria-label="Merge all tabs"
              disabled={busy}
              onClick={() => setConfirmMerge((open) => !open)}
              style={{ ...menuItemStyle, width: 'auto', padding: '0.25rem' }}
            >
              <Layers style={iconStyle} />
            </button>
            {confirmMerge && (
              <div role="dialog" aria-label="Merge all tabs" style={popoverStyle}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--foreground)' }}>
                  Put every tab back into one document? The text stays exactly as it is; only the tabs go.
                </p>
                <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                  <button type="button" style={secondaryButton} onClick={() => setConfirmMerge(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={() => {
                      setConfirmMerge(false)
                      onMergeAll()
                    }}
                  >
                    Merge tabs
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {tabs.map((tab, index) => {
          const active = tab.tab_id === activeTabId
          return (
            <li key={tab.tab_id} style={{ position: 'relative' }} ref={menuFor === tab.tab_id ? (menuRef as React.RefObject<HTMLLIElement>) : undefined}>
              {renaming === tab.tab_id ? (
                <input
                  autoFocus
                  value={draftTitle}
                  maxLength={120}
                  aria-label="Tab title"
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => finishRename(tab)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') finishRename(tab)
                    if (event.key === 'Escape') setRenaming(null)
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '0.8125rem',
                    padding: '0.375rem 0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--primary)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '0.375rem',
                    background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  }}
                >
                  {!active && onOpenHeading && (tab.outline ?? []).some((item) => (item.kind ?? 'heading') === 'heading') && (
                    <button
                      type="button"
                      aria-label={expanded.has(tab.tab_id) ? `Hide the headings of ${tab.title}` : `Show the headings of ${tab.title}`}
                      aria-expanded={expanded.has(tab.tab_id)}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current)
                          if (next.has(tab.tab_id)) next.delete(tab.tab_id)
                          else next.add(tab.tab_id)
                          return next
                        })
                      }
                      style={{ ...menuItemStyle, width: 'auto', padding: '0.25rem 0 0.25rem 0.25rem', color: 'var(--muted-foreground)' }}
                    >
                      <ChevronRight style={{ ...iconStyle, transform: expanded.has(tab.tab_id) ? 'rotate(90deg)' : undefined, transition: 'transform 120ms' }} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    disabled={busy && !active}
                    onClick={() => !active && onOpen(tab.tab_id)}
                    onDoubleClick={() => !readOnly && startRename(tab)}
                    title={tab.title}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.375rem 0.5rem',
                      border: 'none',
                      background: 'transparent',
                      color: active ? 'var(--primary)' : 'var(--foreground)',
                      fontWeight: active ? 600 : 400,
                      fontSize: '0.8125rem',
                      textAlign: 'left',
                      cursor: active ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <FileText style={{ ...iconStyle, opacity: 0.7 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title}</span>
                    {tab.page_count > 0 && (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontWeight: 400 }}>
                        {tab.page_count} p.
                      </span>
                    )}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`More for ${tab.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuFor === tab.tab_id}
                      disabled={busy}
                      onClick={() => {
                        setNumberingFor(null)
                        setConfirmDelete(null)
                        setMenuFor((open) => (open === tab.tab_id ? null : tab.tab_id))
                      }}
                      style={{ ...menuItemStyle, width: 'auto', padding: '0.25rem', color: 'var(--muted-foreground)' }}
                    >
                      <MoreHorizontal style={iconStyle} />
                    </button>
                  )}
                </div>
              )}

              {!active && expanded.has(tab.tab_id) && onOpenHeading && (
                <ul style={{ listStyle: 'none', margin: '0 0 0.25rem', padding: '0 0 0 1.5rem' }}>
                  {(tab.outline ?? [])
                    .filter((item) => (item.kind ?? 'heading') === 'heading' && item.level <= 2)
                    .slice(0, 60)
                    .map((item, index) => (
                      <li key={`${index}-${item.text}`}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onOpenHeading(tab.tab_id, item.text, item.level)}
                          title={item.text}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--muted-foreground)',
                            fontSize: '0.75rem',
                            padding: `0.1875rem 0.25rem 0.1875rem ${(item.level - 1) * 0.75 + 0.25}rem`,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'inherit',
                          }}
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              {menuFor === tab.tab_id && (
                <div role="menu" style={popoverStyle}>
                  {confirmDelete === tab.tab_id ? (
                    <div>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--foreground)' }}>
                        Delete “{tab.title}” and its text? A copy is kept in the version history.
                      </p>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <button type="button" style={secondaryButton} onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          style={{ ...primaryButton, background: 'var(--destructive, #dc2626)' }}
                          onClick={() => {
                            setMenuFor(null)
                            setConfirmDelete(null)
                            onDelete(tab.tab_id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : numberingFor === tab.tab_id ? (
                    <div role="group" aria-label="Page numbering">
                      {NUMBERING_CHOICES.map((choice) => (
                        <button
                          key={choice.label}
                          type="button"
                          role="menuitemradio"
                          aria-checked={sameNumbering(tab.numbering, choice.value)}
                          style={{ ...menuItemStyle, fontWeight: sameNumbering(tab.numbering, choice.value) ? 600 : 400 }}
                          onClick={() => {
                            setMenuFor(null)
                            setNumberingFor(null)
                            onSetNumbering(tab.tab_id, choice.value)
                          }}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <button type="button" role="menuitem" style={menuItemStyle} onClick={() => startRename(tab)}>
                        <Pencil style={iconStyle} /> Rename
                      </button>
                      <button type="button" role="menuitem" style={menuItemStyle} onClick={() => setNumberingFor(tab.tab_id)}>
                        <Hash style={iconStyle} /> Page numbering…
                      </button>
                      {onDownload && (
                        <button
                          type="button"
                          role="menuitem"
                          style={menuItemStyle}
                          onClick={() => {
                            setMenuFor(null)
                            onDownload(tab.tab_id)
                          }}
                        >
                          <Download style={iconStyle} /> Download this tab…
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        style={menuItemStyle}
                        disabled={index === 0}
                        onClick={() => {
                          setMenuFor(null)
                          onMove(tab.tab_id, index - 1)
                        }}
                      >
                        <ArrowUp style={iconStyle} /> Move up
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        style={menuItemStyle}
                        disabled={index === tabs.length - 1}
                        onClick={() => {
                          setMenuFor(null)
                          onMove(tab.tab_id, index + 1)
                        }}
                      >
                        <ArrowDown style={iconStyle} /> Move down
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        style={{ ...menuItemStyle, color: 'var(--destructive, #dc2626)' }}
                        disabled={tabs.length === 1}
                        onClick={() => setConfirmDelete(tab.tab_id)}
                      >
                        <Trash2 style={iconStyle} /> Delete tab
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

const popoverStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 40,
  minWidth: '13rem',
  padding: '0.375rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
}

const primaryButton: CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.3125rem 0.625rem',
  borderRadius: '0.375rem',
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryButton: CSSProperties = {
  ...primaryButton,
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
}
