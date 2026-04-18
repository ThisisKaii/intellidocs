import { useState, useEffect } from 'react'
import * as FormattingCommands from './FormattingCommands'
import { isFormatActive, restoreSelection } from './SelectionManager'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Underline,
} from 'lucide-react'

interface ToolbarProps {
  onFormatApplied?: (action: string) => void
  onFocusEditor?: () => void
}

interface ToolbarItem {
  format: string
  icon?: React.ElementType
  text?: string
  label: string
  command: () => void
}

/** Editor formatting toolbar with ultra-minimal flat styling. */
export function Toolbar({ onFormatApplied, onFocusEditor }: ToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

  useEffect(() => {
    const updateActiveFormats = () => {
      const formats = new Set<string>()
      if (isFormatActive('bold')) formats.add('bold')
      if (isFormatActive('italic')) formats.add('italic')
      if (isFormatActive('underline')) formats.add('underline')
      setActiveFormats(formats)
    }

    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [])

  const TOOLBAR_GROUPS: ToolbarItem[][] = [
    [
      { format: 'bold', icon: Bold, label: 'Bold', command: FormattingCommands.bold },
      { format: 'italic', icon: Italic, label: 'Italic', command: FormattingCommands.italic },
      { format: 'underline', icon: Underline, label: 'Underline', command: FormattingCommands.underline },
    ],
    [
      { format: 'heading1', text: 'H1', label: 'Heading 1', command: FormattingCommands.heading1 },
      { format: 'heading2', text: 'H2', label: 'Heading 2', command: FormattingCommands.heading2 },
      { format: 'heading3', text: 'H3', label: 'Heading 3', command: FormattingCommands.heading3 },
    ],
    [
      { format: 'blockquote', icon: Quote, label: 'Blockquote', command: FormattingCommands.blockquote },
      { format: 'unordered_list', icon: List, label: 'Bullet list', command: FormattingCommands.bulletList },
      { format: 'ordered_list', icon: ListOrdered, label: 'Numbered list', command: FormattingCommands.numberedList },
    ],
    [
      { format: 'align-left', icon: AlignLeft, label: 'Align left', command: () => document.execCommand('justifyLeft', false) },
      { format: 'align-center', icon: AlignCenter, label: 'Align center', command: () => document.execCommand('justifyCenter', false) },
      { format: 'align-right', icon: AlignRight, label: 'Align right', command: () => document.execCommand('justifyRight', false) },
    ],
  ]

  function handleClick(item: ToolbarItem) {
    onFocusEditor?.()
    restoreSelection()
    item.command()
    if (item.format) onFormatApplied?.(item.format)

    setActiveFormats((prev) => {
      const next = new Set(prev)
      if (next.has(item.format)) next.delete(item.format)
      else next.add(item.format)
      return next
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-2">
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && <div className="w-px h-5 bg-border/60 mx-3" />}
          {group.map((item) => {
            const active = activeFormats.has(item.format)
            return (
              <button
                key={item.format}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleClick(item)
                }}
                title={item.label}
                className={`flex items-center justify-center min-w-7 h-7 rounded bg-transparent border-0 shadow-none outline-none focus:outline-none transition-colors ${
                  active
                    ? 'bg-secondary/80 text-foreground'
                    : 'text-muted-foreground/80 hover:text-foreground hover:bg-secondary/40'
                }`}
              >
                {item.icon ? (
                  <item.icon className="w-4 h-4" />
                ) : (
                  <span className="font-sans text-xs font-semibold">{item.text}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
