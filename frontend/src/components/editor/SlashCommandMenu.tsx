import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Table,
  Type,
  Hash,
  Minus,
  Undo2,
  Redo2,
  Copy,
  Scissors,
  ClipboardPaste,
  FileText,
} from 'lucide-react'

interface SlashCommand {
  id: string
  label: string
  description: string
  icon: typeof Heading1
  category: 'headings' | 'blocks' | 'actions'
  keywords: string[]
  action: (editor: Editor) => void
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Chapter / major heading',
    icon: Heading1,
    category: 'headings',
    keywords: ['h1', 'heading1', 'chapter', 'title'],
    action: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Section heading',
    icon: Heading2,
    category: 'headings',
    keywords: ['h2', 'heading2', 'section'],
    action: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Subsection heading',
    icon: Heading3,
    category: 'headings',
    keywords: ['h3', 'heading3', 'subsection'],
    action: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: 'chapter',
    label: 'Chapter Title',
    description: 'Centered, uppercase bold chapter',
    icon: Type,
    category: 'headings',
    keywords: ['chapter', 'ch'],
    action: (e) =>
      e.chain().focus().setHeading({ level: 1 }).setTextAlign('center').toggleBold().run(),
  },
  {
    id: 'quote',
    label: 'Blockquote',
    description: 'Indented quotation',
    icon: Quote,
    category: 'blocks',
    keywords: ['quote', 'blockquote', 'citation'],
    action: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: Minus,
    category: 'blocks',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
    action: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    description: 'Ordered list',
    icon: Hash,
    category: 'blocks',
    keywords: ['numbered', 'ordered', 'ol', 'list'],
    action: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'table',
    label: 'Insert Table',
    description: '3-column table',
    icon: Table,
    category: 'blocks',
    keywords: ['table', 'grid', 'spreadsheet'],
    action: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'divider',
    label: 'Page Break',
    description: 'Horizontal divider / page break',
    icon: Minus,
    category: 'blocks',
    keywords: ['divider', 'break', 'hr', 'line'],
    action: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: 'undo',
    label: 'Undo',
    description: 'Undo last change',
    icon: Undo2,
    category: 'actions',
    keywords: ['undo', 'revert'],
    action: (e) => e.chain().focus().undo().run(),
  },
  {
    id: 'redo',
    label: 'Redo',
    description: 'Redo last change',
    icon: Redo2,
    category: 'actions',
    keywords: ['redo', 'repeat'],
    action: (e) => e.chain().focus().redo().run(),
  },
  {
    id: 'cut',
    label: 'Cut',
    description: 'Cut selection to clipboard',
    icon: Scissors,
    category: 'actions',
    keywords: ['cut', 'remove'],
    action: () => document.execCommand('cut'),
  },
  {
    id: 'copy',
    label: 'Copy',
    description: 'Copy selection to clipboard',
    icon: Copy,
    category: 'actions',
    keywords: ['copy'],
    action: () => document.execCommand('copy'),
  },
  {
    id: 'paste',
    label: 'Paste',
    description: 'Paste from clipboard',
    icon: ClipboardPaste,
    category: 'actions',
    keywords: ['paste'],
    action: () => document.execCommand('paste'),
  },
  {
    id: 'clear',
    label: 'Clear Formatting',
    description: 'Remove all formatting',
    icon: FileText,
    category: 'actions',
    keywords: ['clear', 'strip', 'plain'],
    action: (e) => e.chain().focus().clearNodes().unsetAllMarks().run(),
  },
]

/** Match the paragraph text before the cursor to a `/command` pattern. */
function extractSlashQuery(
  editor: Editor,
): { text: string; from: number; to: number } | null {
  const { state } = editor
  const { $from } = state.selection
  const node = $from.parent
  if (!node || node.type.name !== 'paragraph') return null
  const text = node.textContent
  const cursorInNode = $from.parentOffset
  const beforeCursor = text.slice(0, cursorInNode)
  const slashMatch = beforeCursor.match(/\/([a-z0-9]*)$/i)
  if (!slashMatch) return null
  const query = slashMatch[1]
  const startInNode = cursorInNode - slashMatch[0].length
  const absFrom = $from.start() + startInNode
  const absTo = $from.pos
  return { text: query, from: absFrom, to: absTo }
}

/** Filter and score commands for the current query. */
function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS
  const q = query.toLowerCase()
  return COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some((kw) => kw.includes(q)),
  ).sort((a, b) => {
    const aExact = a.label.toLowerCase().startsWith(q) || a.keywords.some((kw) => kw === q)
    const bExact = b.label.toLowerCase().startsWith(q) || b.keywords.some((kw) => kw === q)
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1
    return a.label.localeCompare(b.label)
  })
}

interface Props {
  editor: Editor
}

/**
 * Slash command menu (plan point 24): typing `/` on a blank or starting
 * paragraph opens a floating quick menu. Keyboard navigable with instant
 * filtering. Also responds to Ctrl+K.
 */
export function SlashCommandMenu({ editor }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = filterCommands(query)

  const handleTransaction = useCallback(() => {
    if (!editor.isFocused) {
      setOpen(false)
      return
    }
    const hit = extractSlashQuery(editor)
    if (hit) {
      setQuery(hit.text)
      setSelectedIdx(0)
      const coords = editor.view.coordsAtPos(hit.from)
      setRect({ top: coords.bottom + 4, left: coords.left })
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.on('transaction', handleTransaction)
    return () => {
      editor.off('transaction', handleTransaction)
    }
  }, [editor, handleTransaction])

  /** Ctrl+K / Cmd+K opens the full palette (no query prefill). */
  useEffect(() => {
    if (!editor) return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const { from } = editor.state.selection
        const coords = editor.view.coordsAtPos(from)
        setRect({ top: coords.bottom + 4, left: coords.left })
        setQuery('')
        setSelectedIdx(0)
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editor])

  function executeCommand(cmd: SlashCommand): void {
    cmd.action(editor)
    setOpen(false)
  }

  /** Keyboard navigation inside the open menu. */
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => (i + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered.length > 0) executeCommand(filtered[selectedIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  })

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!open || filtered.length === 0 || !rect) return null

  const CATEGORIES = ['headings', 'blocks', 'actions'] as const
  let globalIdx = 0

  return (
    <div
      ref={containerRef}
      className="slash-command-menu"
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        zIndex: 100,
      }}
    >
      {CATEGORIES.map((cat) => {
        const cmds = filtered.filter((c) => c.category === cat)
        if (cmds.length === 0) return null
        return (
          <div key={cat}>
            <div className="slash-cat-label">{cat.toUpperCase()}</div>
            {cmds.map((cmd) => {
              const isSelected = globalIdx === selectedIdx
              const idx = globalIdx++
              return (
                <div
                  key={cmd.id}
                  className={`slash-item ${isSelected ? 'slash-item-selected' : ''}`}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <cmd.icon size={14} />
                  <div>
                    <span className="slash-item-label">{cmd.label}</span>
                    <span className="slash-item-desc">{cmd.description}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}